use std::{convert::Infallible, net::SocketAddr, path::PathBuf, sync::Arc, time::Duration};

use futures::{FutureExt, StreamExt, SinkExt};
use serde::Serialize;
use tokio::sync::broadcast::{self, Sender};
use warp::ws::{Message, WebSocket};
use warp::{Filter, Rejection, Reply};

use crate::runtime::SharedRuntimeState;
use crate::media::{self, MediaIndexItem};

#[derive(Serialize)]
struct HealthResponse {
  runtimeStatus: String,
  filesystemStatus: String,
  databaseStatus: String,
  websocketConnected: bool,
}

#[derive(Serialize)]
struct RuntimeInfo {
  runtimeVersion: String,
  storageRoot: String,
  serverPort: u16,
  websocketPort: u16,
  runtimeStatus: String,
  filesystemStatus: String,
  databaseStatus: String,
  lastScanAt: Option<String>,
  lastRepairAt: Option<String>,
}

#[derive(Serialize)]
struct CategoryDefinition {
  id: String,
  name: String,
  folder: String,
  itemCount: usize,
  lastScannedAt: Option<String>,
}

#[derive(Serialize)]
struct MediaItemResponse {
  id: String,
  title: String,
  path: String,
  kind: String,
  category: String,
  createdAt: String,
  updatedAt: String,
}

pub async fn start_servers(shared: SharedRuntimeState, server_port: u16, websocket_port: u16) {
  let shared_rest = shared.clone();
  let rest = warp::path::end()
    .map(|| warp::reply::html("MediaGrid runtime"));

  let health_route = warp::path("health").and(warp::get()).map(move || {
    let body = HealthResponse {
      runtimeStatus: "ready".to_string(),
      filesystemStatus: "ready".to_string(),
      databaseStatus: "ready".to_string(),
      websocketConnected: true,
    };

    warp::reply::json(&body)
  });

  let runtime_route = warp::path("runtime").and(warp::get()).map(move || {
    let body = RuntimeInfo {
      runtimeVersion: "0.1.0".to_string(),
      storageRoot: shared_rest.lock().unwrap().storage_root.to_string_lossy().to_string(),
      serverPort: server_port,
      websocketPort: websocket_port,
      runtimeStatus: "ready".to_string(),
      filesystemStatus: "ready".to_string(),
      databaseStatus: "ready".to_string(),
      lastScanAt: None,
      lastRepairAt: None,
    };

    warp::reply::json(&body)
  });

  let categories_route = warp::path("categories").and(warp::get()).map(move || {
    let categories = vec![
      CategoryDefinition { id: "movies".into(), name: "Movies".into(), folder: "media/movies".into(), itemCount: 0, lastScannedAt: None },
      CategoryDefinition { id: "music".into(), name: "Music".into(), folder: "media/music".into(), itemCount: 0, lastScannedAt: None },
      CategoryDefinition { id: "shows".into(), name: "Shows".into(), folder: "media/shows".into(), itemCount: 0, lastScannedAt: None },
      CategoryDefinition { id: "photos".into(), name: "Photos".into(), folder: "media/photos".into(), itemCount: 0, lastScannedAt: None },
      CategoryDefinition { id: "downloads".into(), name: "Downloads".into(), folder: "media/downloads".into(), itemCount: 0, lastScannedAt: None },
    ];

    warp::reply::json(&serde_json::json!({ "categories": categories, "total": categories.len() }))
  });

  // implement /media/{category}
  let shared_for_media = shared.clone();
  let media_route = warp::path("media")
    .and(warp::path::param::<String>())
    .and(warp::get())
    .and_then(move |category: String| {
      let shared = shared_for_media.clone();

      async move {
        let cfg = &shared.lock().unwrap().config;
        let root = shared.lock().unwrap().storage_root.clone();
        let items = media::scan_media(&root, &cfg).unwrap_or_default();

        let response_items: Vec<MediaItemResponse> = items
          .into_iter()
          .filter(|it| it.category == category)
          .map(|it| MediaItemResponse {
            id: format!("{}", uuid::Uuid::new_v4()),
            title: it.title,
            path: it.path.to_string_lossy().to_string(),
            kind: it.kind,
            category: it.category,
            createdAt: it.created_at,
            updatedAt: it.updated_at,
          })
          .collect();

        Ok::<_, Rejection>(warp::reply::json(&serde_json::json!({ "category": category, "items": response_items, "total": response_items.len() })))
      }
    });

  // WebSocket broadcaster
  let (tx, _rx) = broadcast::channel::<String>(128);
  let tx_ws = tx.clone();

  let ws_route = warp::path("ws")
    .and(warp::ws())
    .and(warp::any().map(move || tx_ws.clone()))
    .map(|ws: warp::ws::Ws, tx: Sender<String>| {
      ws.on_upgrade(move |socket| client_connection(socket, tx))
    });

  let routes = rest.or(health_route).or(runtime_route).or(categories_route).or(media_route).or(ws_route);

  // spawn REST server
  let rest_addr: SocketAddr = ([127, 0, 0, 1], server_port).into();
  let rest_server = warp::serve(routes).run(rest_addr);

  // background rescan broadcaster
  let broadcast_tx = tx.clone();
  let shared_for_task = shared.clone();
  tokio::spawn(async move {
    let mut previous = std::collections::HashMap::<String, u64>::new();

    loop {
      let items = media::scan_media(&shared_for_task.lock().unwrap().storage_root, &shared_for_task.lock().unwrap().config).unwrap_or_default();
      let mut current = std::collections::HashMap::new();

      for it in &items {
        current.insert(it.path.to_string_lossy().to_string(), it.updated_at.parse::<u64>().unwrap_or(0));
      }

      // detect added
      for (path, mtime) in &current {
        if !previous.contains_key(path) {
          let _ = broadcast_tx.send(serde_json::json!({ "type": "MEDIA_ADDED", "timestamp": chrono::Utc::now().to_rfc3339(), "media": { "path": path } }).to_string());
        }
      }

      // detect removed
      for path in previous.keys() {
        if !current.contains_key(path) {
          let _ = broadcast_tx.send(serde_json::json!({ "type": "MEDIA_REMOVED", "timestamp": chrono::Utc::now().to_rfc3339(), "mediaId": path }).to_string());
        }
      }

      previous = current;
      tokio::time::sleep(Duration::from_secs(10)).await;
    }
  });

  // run server (this blocks the current task until shutdown)
  tokio::spawn(rest_server.map(|_| ())).await.ok();
}

async fn client_connection(ws: WebSocket, tx: Sender<String>) {
  let (mut ws_tx, mut ws_rx) = ws.split();

  let mut rx = tx.subscribe();

  // Send RUNTIME_READY immediately
  let _ = ws_tx.send(Message::text(serde_json::json!({ "type": "RUNTIME_READY", "timestamp": chrono::Utc::now().to_rfc3339() }).to_string())).await;

  // forward broadcast messages to websocket
  let mut send_task = tokio::spawn(async move {
    while let Ok(msg) = rx.recv().await {
      if ws_tx.send(Message::text(msg)).await.is_err() {
        break;
      }
    }
  });

  // read loop to keep connection alive
  let mut recv_task = tokio::spawn(async move {
    while let Some(result) = ws_rx.next().await {
      match result {
        Ok(msg) => {
          if msg.is_text() {
            // ignore client messages for now
          } else if msg.is_close() {
            break;
          }
        }
        Err(_) => break,
      }
    }
  });

  let _ = tokio::join!(send_task, recv_task);
}
