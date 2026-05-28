use std::net::SocketAddr;

use futures::{SinkExt, StreamExt};
use tokio::sync::broadcast::{self, Sender};
use warp::ws::{Message, WebSocket};

use crate::runtime::SharedRuntimeState;

pub async fn start_servers(
    shared: SharedRuntimeState,
    server_port: u16,
    websocket_port: u16,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
    app_handle: Option<tauri::AppHandle>,
) {
    log::info!(
        "Starting REST API on port {} and WebSocket on port {}...",
        server_port,
        websocket_port
    );

    // WebSocket broadcaster
    let (tx, _rx) = broadcast::channel::<String>(128);
    let tx_ws = tx.clone();

    // Save the event broadcaster to the state so that other modules can access it
    {
        let mut state = shared.lock().unwrap();
        state.event_tx = Some(tx.clone());
    }

    if let Some(ref handle) = app_handle {
        crate::runtime::ensure_background_systems(handle);
        // Enqueue a full scan on every startup so the web client sees existing media
        crate::runtime::request_scan(handle);
    } else {
        crate::runtime::start_headless_background_systems(shared.clone(), shutdown_rx.clone());
    }

    let routes = crate::api::get_routes(
        shared.clone(),
        server_port,
        websocket_port,
        tx_ws.clone(),
        app_handle.clone(),
    );
    let ws_routes = crate::api::get_websocket_route(shared.clone(), tx_ws, app_handle.clone());

    // graceful shutdown logic for warp
    let graceful_shutdown = make_shutdown_signal(shutdown_rx.clone());
    let ws_graceful_shutdown = make_shutdown_signal(shutdown_rx.clone());

    // Keep the Warp server futures alive inside this async task. The headless
    // dev_server owns a Tokio runtime, while Tauri owns the app runtime.
    // Avoiding nested tokio::spawn calls keeps `tauri dev` from losing the
    // listeners after this function logs startup.
    let rest_addr: SocketAddr = ([0, 0, 0, 0], server_port).into();
    let (_, rest_server) =
        warp::serve(routes).bind_with_graceful_shutdown(rest_addr, graceful_shutdown);

    if websocket_port != server_port {
        let ws_addr: SocketAddr = ([0, 0, 0, 0], websocket_port).into();
        let (_, ws_server) =
            warp::serve(ws_routes).bind_with_graceful_shutdown(ws_addr, ws_graceful_shutdown);
        tokio::select! {
            _ = rest_server => {
                log::info!("Warp REST server stopped.");
            }
            _ = ws_server => {
                log::info!("Warp WebSocket server stopped.");
            }
        }
    } else {
        rest_server.await;
        log::info!("Warp REST server stopped.");
    }
}

fn make_shutdown_signal(
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> impl std::future::Future<Output = ()> + Send + 'static {
    async move {
        loop {
            if *shutdown_rx.borrow() {
                break;
            }
            if shutdown_rx.changed().await.is_err() {
                break; // Sender dropped
            }
        }
    }
}

pub async fn client_connection(
    ws: WebSocket,
    tx: Sender<String>,
    addr: Option<SocketAddr>,
    shared_state: SharedRuntimeState,
    app_handle: Option<tauri::AppHandle>,
) {
    let client_info = if let Some(a) = addr {
        format!("Web Dashboard ({})", a.ip())
    } else {
        "Web Dashboard (unknown)".to_string()
    };

    log::info!("WebSocket client connecting from: {}", client_info);

    // Add client connection
    {
        let mut state = shared_state.lock().unwrap();
        state.active_connections.push(client_info.clone());
    }
    if let Some(ref handle) = app_handle {
        let _ = crate::tray::update_tray_menu(handle);
    }

    let (mut ws_tx, mut ws_rx) = ws.split();
    let mut rx = tx.subscribe();

    // Send RUNTIME_READY immediately with full runtime details
    let r_info = {
        let state = shared_state.lock().unwrap();
        crate::runtime::runtime_info(
            &state,
            state.config.server_port,
            state.config.websocket_port,
        )
    };

    log::info!(
        "Sending RUNTIME_READY details to WebSocket client: {}",
        client_info
    );
    let _ = ws_tx
        .send(Message::text(
            serde_json::json!({
              "type": "RUNTIME_READY",
              "timestamp": chrono::Utc::now().to_rfc3339(),
              "runtime": r_info
            })
            .to_string(),
        ))
        .await;

    // Send FILESYSTEM_REPAIRED immediately if files were repaired on startup
    let repaired_paths: Vec<String> = {
        let state = shared_state.lock().unwrap();
        state
            .filesystem_repaired_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect()
    };

    if !repaired_paths.is_empty() {
        log::info!(
            "Sending FILESYSTEM_REPAIRED immediately to WebSocket client: {:?}",
            repaired_paths
        );
        let _ = ws_tx
            .send(Message::text(
                serde_json::json!({
                  "type": "FILESYSTEM_REPAIRED",
                  "timestamp": chrono::Utc::now().to_rfc3339(),
                  "repairedPaths": repaired_paths
                })
                .to_string(),
            ))
            .await;
    }

    // forward broadcast messages to websocket
    let client_info_send = client_info.clone();
    let send_loop = async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if ws_tx.send(Message::text(msg)).await.is_err() {
                        log::error!("Failed to send message to client {}", client_info_send);
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    log::warn!("Client {} lagged by {} messages", client_info_send, n);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    };

    // read loop to keep connection alive
    let client_info_recv = client_info.clone();
    let recv_loop = async move {
        while let Some(result) = ws_rx.next().await {
            match result {
                Ok(msg) => {
                    if msg.is_close() {
                        log::info!("Received close frame from client {}", client_info_recv);
                        break;
                    }
                }
                Err(err) => {
                    log::error!("WebSocket error for client {}: {:?}", client_info_recv, err);
                    break;
                }
            }
        }
    };

    tokio::select! {
        _ = send_loop => {}
        _ = recv_loop => {}
    }
    log::info!("WebSocket client connection finished: {}", client_info);

    // Remove client connection on disconnect
    {
        let mut state = shared_state.lock().unwrap();
        if let Some(pos) = state
            .active_connections
            .iter()
            .position(|x| x == &client_info)
        {
            state.active_connections.remove(pos);
        }
    }
    if let Some(ref handle) = app_handle {
        let _ = crate::tray::update_tray_menu(handle);
    }
}
