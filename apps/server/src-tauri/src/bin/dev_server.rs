use std::sync::Arc;

use tokio::runtime::Builder;

fn main() {
  let rt = Builder::new_current_thread()
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

    eprintln!("Starting REST server on port {} and WS on {}", cfg.server_port, cfg.websocket_port);

    match tokio::time::timeout(
      tokio::time::Duration::from_secs(30),
      app_lib::server::start_servers(shared, cfg.server_port, cfg.websocket_port),
    )
    .await
    {
      Ok(_) => eprintln!("Server finished"),
      Err(e) => eprintln!("Server timeout or error: {}", e),
    }
  });
}
