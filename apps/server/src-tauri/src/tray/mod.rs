use crate::runtime::SharedRuntimeState;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    Manager,
};

pub fn init_tray(app: &tauri::App) -> tauri::Result<()> {
    let initial_menu = MenuBuilder::new(app)
        .item(
            &MenuItemBuilder::new("MediaGrid")
                .id("title")
                .enabled(false)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new("Open Web Dashboard")
                .id("open_dashboard")
                .build(app)?,
        )
        .item(
            &SubmenuBuilder::new(app, "Connected Devices")
                .item(
                    &MenuItemBuilder::new("No devices connected")
                        .id("no_devices")
                        .enabled(false)
                        .build(app)?,
                )
                .build()?,
        )
        .item(
            &MenuItemBuilder::new("Media Folders")
                .id("open_media_folders")
                .build(app)?,
        )
        .item(
            &SubmenuBuilder::new(app, "Runtime Status")
                .item(
                    &MenuItemBuilder::new("Runtime Active")
                        .id("status_active")
                        .enabled(false)
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::new("API: starting...")
                        .id("status_api")
                        .enabled(false)
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::new("WebSocket: starting...")
                        .id("status_ws")
                        .enabled(false)
                        .build(app)?,
                )
                .build()?,
        )
        .item(
            &MenuItemBuilder::new("Open Logs Folder")
                .id("open_logs_folder")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new("Restart Runtime")
                .id("restart_runtime")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::new("Rescan Media")
                .id("rescan_media")
                .build(app)?,
        )
        .item(&MenuItemBuilder::new("Settings").id("settings").build(app)?)
        .item(&MenuItemBuilder::new("About").id("about").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new("Quit").id("quit").build(app)?)
        .build()?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&initial_menu)
        .on_menu_event(
            |app_handle: &tauri::AppHandle, event: tauri::menu::MenuEvent| {
                let id = event.id().as_ref().to_string();

                match id.as_str() {
                    "open_dashboard" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "open_media_folders" => {
                        let state = app_handle.state::<SharedRuntimeState>();
                        let root = state.lock().unwrap().storage_root.clone();
                        let media_dir = root.join("media");
                        let _ = open::that(media_dir);
                    }
                    "open_logs_folder" => {
                        let state = app_handle.state::<SharedRuntimeState>();
                        let root = state.lock().unwrap().storage_root.clone();
                        let logs_dir = root.join("logs");
                        let _ = open::that(logs_dir);
                    }
                    "restart_runtime" => {
                        let handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            crate::runtime::restart_runtime(&handle);
                        });
                    }
                    "rescan_media" => {
                        let handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = handle.state::<SharedRuntimeState>();
                            log::info!("Manual rescan triggered from tray menu.");
                            let (storage_root, config, db_conn) = {
                                let mut state_lock = state.lock().unwrap();
                                state_lock.is_scanning = true;
                                (
                                    state_lock.storage_root.clone(),
                                    state_lock.config.clone(),
                                    state_lock.db_conn.clone(),
                                )
                            };
                            let _ = update_tray_menu(&handle);

                            let indexed_media = crate::media::scan_media(&storage_root, &config)
                                .unwrap_or_default();
                            {
                                let mut conn_lock = db_conn.lock().unwrap();
                                let _ = crate::database::write_media_items(
                                    &mut *conn_lock,
                                    &indexed_media,
                                );
                            }

                            {
                                let mut state_lock = state.lock().unwrap();
                                state_lock.is_scanning = false;
                                state_lock.indexed_media_count = indexed_media.len();
                                state_lock.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
                            }
                            log::info!(
                                "Manual rescan finished. Scanned {} items.",
                                indexed_media.len()
                            );
                            let _ = update_tray_menu(&handle);
                        });
                    }
                    "settings" => {
                        let state = app_handle.state::<SharedRuntimeState>();
                        let root = state.lock().unwrap().storage_root.clone();
                        let config_file = root.join("config/config.json");
                        let _ = open::that(config_file);
                    }
                    "about" => {
                        std::thread::spawn(|| {
                            rfd::MessageDialog::new()
                                .set_title("About MediaGrid")
                                .set_description("MediaGrid\nVersion 0.1\nRuntime Phase 1")
                                .set_buttons(rfd::MessageButtons::Ok)
                                .set_level(rfd::MessageLevel::Info)
                                .show();
                        });
                    }
                    "quit" => {
                        log::info!("Quit requested. Stopping servers and scanner...");
                        let state = app_handle.state::<SharedRuntimeState>();
                        crate::runtime::stop_services(&state);
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        app_handle.exit(0);
                    }
                    _ => {}
                }
            },
        )
        .build(app)?;

    Ok(())
}

pub fn update_tray_menu(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app_handle.state::<SharedRuntimeState>();
    let state_lock = state.lock().unwrap();

    // 1. Build Connected Devices submenu
    let mut devices_builder = SubmenuBuilder::new(app_handle, "Connected Devices");
    if state_lock.active_connections.is_empty() {
        devices_builder = devices_builder.item(
            &MenuItemBuilder::new("No devices connected")
                .id("no_devices")
                .enabled(false)
                .build(app_handle)?,
        );
    } else {
        for conn in &state_lock.active_connections {
            devices_builder = devices_builder.item(
                &MenuItemBuilder::new(format!("- {}", conn))
                    .id(format!("device_{}", conn))
                    .enabled(false)
                    .build(app_handle)?,
            );
        }
    }
    let devices_submenu = devices_builder.build()?;

    // 2. Build Runtime Status submenu
    let scan_status_str = if state_lock.is_scanning {
        "Scanning..."
    } else {
        "Idle"
    };
    let status_submenu = SubmenuBuilder::new(app_handle, "Runtime Status")
        .item(
            &MenuItemBuilder::new("Runtime Active")
                .id("status_active")
                .enabled(false)
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new(format!("API Port: {}", state_lock.config.server_port))
                .id("status_api_port")
                .enabled(false)
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new(format!(
                "WebSocket Port: {}",
                state_lock.config.websocket_port
            ))
            .id("status_ws_port")
            .enabled(false)
            .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new(format!("Scan Status: {}", scan_status_str))
                .id("status_scan")
                .enabled(false)
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new(format!("Indexed Media: {}", state_lock.indexed_media_count))
                .id("status_count")
                .enabled(false)
                .build(app_handle)?,
        )
        .build()?;

    // 3. Rebuild main tray menu
    let new_menu = MenuBuilder::new(app_handle)
        .item(
            &MenuItemBuilder::new("MediaGrid")
                .id("title")
                .enabled(false)
                .build(app_handle)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::new("Open Web Dashboard")
                .id("open_dashboard")
                .build(app_handle)?,
        )
        .item(&devices_submenu)
        .item(
            &MenuItemBuilder::new("Media Folders")
                .id("open_media_folders")
                .build(app_handle)?,
        )
        .item(&status_submenu)
        .item(
            &MenuItemBuilder::new("Open Logs Folder")
                .id("open_logs_folder")
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new("Restart Runtime")
                .id("restart_runtime")
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new("Rescan Media")
                .id("rescan_media")
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new("Settings")
                .id("settings")
                .build(app_handle)?,
        )
        .item(
            &MenuItemBuilder::new("About")
                .id("about")
                .build(app_handle)?,
        )
        .separator()
        .item(&MenuItemBuilder::new("Quit").id("quit").build(app_handle)?)
        .build()?;

    // 4. Update the tray icon menu
    if let Some(tray) = app_handle.tray_by_id("main-tray") {
        tray.set_menu(Some(new_menu))?;
    }

    Ok(())
}
