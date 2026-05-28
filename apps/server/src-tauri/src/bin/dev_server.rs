use tokio::runtime::Builder;

fn main() {
    let rt = Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("failed to build tokio runtime");

    rt.block_on(async {
        // bootstrap runtime without Tauri
        eprintln!("Bootstrapping runtime...");
        let shared = app_lib::runtime::bootstrap();
        eprintln!("Runtime bootstrapped successfully");

        // read ports from config
        let cfg = shared.lock().unwrap().config.clone();

        eprintln!(
            "Starting REST server on port {} and WS on {}",
            cfg.server_port, cfg.websocket_port
        );

        let (_shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        app_lib::server::start_servers(
            shared,
            cfg.server_port,
            cfg.websocket_port,
            shutdown_rx,
            None,
        )
        .await;
    });
}
