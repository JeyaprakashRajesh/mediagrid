#![recursion_limit = "512"]

pub mod api;
pub mod cache;
mod commands;
pub mod config;
pub mod database;
pub mod indexing;
pub mod jobs;
mod logger;
pub mod media;
pub mod metadata;
pub mod runtime;
pub mod server;
pub mod storage;
pub mod sync;
pub mod thumbnails;
mod tray;
pub mod watcher;
mod websocket;

pub mod streaming;
pub mod transcoding;
pub mod hls;
pub mod subtitles;
pub mod sessions;
pub mod watch;
pub mod audio;
pub mod bandwidth;
pub mod auth;
pub mod devices;
pub mod pairing;
pub mod access;
pub mod networking;
pub mod security;
pub mod remote;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ensure global config directory and logs directory exist before logger plugin starts
    let logs_dir = crate::storage::global_config_dir().join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                        path: logs_dir,
                        file_name: Some("mediagrid.log".to_string()),
                    }),
                ])
                .build(),
        )
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            log::info!("Initializing MediaGrid background runtime...");

            // Initialize runtime state
            let runtime_state = runtime::bootstrap();
            app.manage(runtime_state.clone());

            // Initialize the tray icon
            tray::init_tray(app)?;

            // Start REST and WebSocket services in background
            runtime::start_services(app.handle());

            // Update tray menu to reflect active ports and status
            tray::update_tray_menu(app.handle())?;

            log::info!("MediaGrid background runtime active.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::restart_runtime,
            commands::rescan_media,
            commands::open_logs_folder,
            commands::open_media_folders,
            commands::select_storage_root,
            commands::setup_runtime,
            commands::get_runtime_endpoint
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
