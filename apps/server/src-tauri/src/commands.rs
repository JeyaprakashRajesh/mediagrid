use tauri::Manager;

use crate::runtime::SharedRuntimeState;

#[tauri::command]
pub fn restart_runtime(app_handle: tauri::AppHandle) {
    crate::runtime::restart_runtime(&app_handle);
}

#[tauri::command]
pub fn rescan_media(app_handle: tauri::AppHandle) {
    let state = app_handle.state::<SharedRuntimeState>().inner().clone();
    let handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        log::info!("Manual rescan triggered via Tauri IPC command.");
        let job_manager = {
            let state_lock = state.lock().unwrap();
            state_lock.job_manager.clone()
        };

        if let Some(job_manager) = job_manager {
            job_manager.enqueue_scan();
            let _ = crate::tray::update_tray_menu(&handle_clone);
        } else {
            log::warn!("Rescan requested before background jobs were initialized.");
        }
    });
}

#[tauri::command]
pub fn open_logs_folder() {
    let logs_dir = crate::storage::global_config_dir().join("logs");
    let _ = open::that(logs_dir);
}

#[tauri::command]
pub fn open_media_folders(app_handle: tauri::AppHandle) {
    let state = app_handle.state::<SharedRuntimeState>();
    let root = state.lock().unwrap().storage_root.clone();
    let media_dir = root.join("media");
    let _ = open::that(media_dir);
}

#[tauri::command]
pub fn select_storage_root() -> Option<String> {
    #[cfg(not(test))]
    {
        let dir = rfd::FileDialog::new()
            .set_title("Select MediaGrid Storage Root")
            .pick_folder();

        dir.map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(test)]
    {
        Some("C:/MediaGrid".to_string())
    }
}

#[tauri::command]
pub fn setup_runtime(app_handle: tauri::AppHandle, storage_root: String) -> Result<(), String> {
    crate::runtime::setup_runtime(&app_handle, std::path::PathBuf::from(storage_root))
}

#[tauri::command]
pub fn get_runtime_endpoint(app_handle: tauri::AppHandle) -> Option<serde_json::Value> {
    let state = app_handle.state::<SharedRuntimeState>();
    let state_lock = state.lock().unwrap();
    let tailscale = crate::networking::get_tailscale_status();

    let server_port = state_lock.config.server_port;
    let websocket_port = state_lock.config.websocket_port;
    tailscale
        .tailnetIp
        .map(|ip| {
            serde_json::json!({
                "baseUrl": format!("http://{}:{}", ip, server_port),
                "websocketUrl": format!("ws://{}:{}/ws", ip, websocket_port),
            })
        })
}
