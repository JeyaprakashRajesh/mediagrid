mod api;
mod config;
mod database;
mod logger;
mod media;
pub mod runtime;
mod storage;
mod websocket;
pub mod server;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let runtime_state = runtime::bootstrap();
      app.manage(runtime_state.clone());
      api::init_api();
      websocket::init_websocket();

      // start REST + WebSocket servers in a dedicated tokio runtime
      let cfg = runtime_state.lock().unwrap().config.clone();
      let server_shared = runtime_state.clone();
      std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
          .enable_all()
          .build()
          .expect("failed to build tokio runtime");

        rt.block_on(async move {
          crate::server::start_servers(server_shared, cfg.server_port, cfg.websocket_port).await;
        });
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
