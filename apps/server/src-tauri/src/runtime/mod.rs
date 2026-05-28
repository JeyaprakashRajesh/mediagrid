use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use crate::{
    config::{self, RuntimeConfig},
    database, jobs, logger, media, storage, thumbnails, watcher,
};

pub struct RuntimeState {
    pub storage_root: PathBuf,
    pub config: RuntimeConfig,
    pub filesystem_repaired_paths: Vec<PathBuf>,
    pub indexed_media_count: usize,
    pub is_scanning: bool,
    pub active_jobs: usize,
    pub scan_progress: f32,
    pub indexing_progress: f32,
    pub api_requests: u64,
    pub active_connections: Vec<String>,
    pub last_scan_at: Option<String>,
    pub last_repair_at: Option<String>,
    pub started_at: String,
    pub shutdown_tx: Option<tokio::sync::watch::Sender<bool>>,
    pub db_conn: Arc<Mutex<rusqlite::Connection>>,
    pub event_tx: Option<tokio::sync::broadcast::Sender<String>>,
    pub job_manager: Option<Arc<jobs::JobManagerHandle>>,
    pub background_workers_started: bool,
    pub is_configured: bool,
    pub active_transcodes: std::collections::HashMap<String, std::process::Child>,
}

impl std::fmt::Debug for RuntimeState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RuntimeState")
            .field("storage_root", &self.storage_root)
            .field("config", &self.config)
            .field("filesystem_repaired_paths", &self.filesystem_repaired_paths)
            .field("indexed_media_count", &self.indexed_media_count)
            .field("is_scanning", &self.is_scanning)
            .field("active_jobs", &self.active_jobs)
            .field("scan_progress", &self.scan_progress)
            .field("indexing_progress", &self.indexing_progress)
            .field("api_requests", &self.api_requests)
            .field("active_connections", &self.active_connections)
            .field("last_scan_at", &self.last_scan_at)
            .field("last_repair_at", &self.last_repair_at)
            .field("started_at", &self.started_at)
            .field("is_configured", &self.is_configured)
            .finish()
    }
}

pub type SharedRuntimeState = Arc<Mutex<RuntimeState>>;

pub fn bootstrap() -> SharedRuntimeState {
    logger::init_logging();

    let bootstrap_cfg = config::BootstrapConfig::load_or_default();

    // If bootstrap.json has a storage_root, use it.
    // Otherwise, default to C:/MediaGrid.
    // We are configured if bootstrap.json has a path OR if the directory C:/MediaGrid already exists on disk (preserving dev and tests).
    let is_configured = bootstrap_cfg.storage_root.is_some()
        || Path::new(storage::DEVELOPMENT_STORAGE_ROOT).exists();

    let storage_root = bootstrap_cfg
        .storage_root
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(storage::DEVELOPMENT_STORAGE_ROOT));

    // Initialize global config directory to store logs
    let global_dir = storage::global_config_dir();
    let _ = std::fs::create_dir_all(global_dir.join("logs"));

    if is_configured {
        let repair_result =
            storage::ensure_layout(&storage_root).expect("failed to initialize storage");
        let config = config::load_or_create(&storage_root).expect("failed to load runtime config");
        let db_conn =
            database::initialize(&storage_root, &config).expect("failed to initialize database");

        let last_repair = if !repair_result.created_paths.is_empty() {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            None
        };

        Arc::new(Mutex::new(RuntimeState {
            storage_root,
            config,
            filesystem_repaired_paths: repair_result.created_paths,
            indexed_media_count: 0,
            is_scanning: false,
            active_jobs: 0,
            scan_progress: 0.0,
            indexing_progress: 0.0,
            api_requests: 0,
            active_connections: Vec::new(),
            last_scan_at: None,
            last_repair_at: last_repair,
            started_at: chrono::Utc::now().to_rfc3339(),
            shutdown_tx: None,
            db_conn: Arc::new(Mutex::new(db_conn)),
            event_tx: None,
            job_manager: None,
            background_workers_started: false,
            is_configured: true,
            active_transcodes: std::collections::HashMap::new(),
        }))
    } else {
        // Unconfigured state uses in-memory DB connection
        let config = RuntimeConfig::defaults();
        let db_conn = rusqlite::Connection::open_in_memory().unwrap();

        Arc::new(Mutex::new(RuntimeState {
            storage_root,
            config,
            filesystem_repaired_paths: Vec::new(),
            indexed_media_count: 0,
            is_scanning: false,
            active_jobs: 0,
            scan_progress: 0.0,
            indexing_progress: 0.0,
            api_requests: 0,
            active_connections: Vec::new(),
            last_scan_at: None,
            last_repair_at: None,
            started_at: chrono::Utc::now().to_rfc3339(),
            shutdown_tx: None,
            db_conn: Arc::new(Mutex::new(db_conn)),
            event_tx: None,
            job_manager: None,
            background_workers_started: false,
            is_configured: false,
            active_transcodes: std::collections::HashMap::new(),
        }))
    }
}

pub fn setup_runtime(app_handle: &tauri::AppHandle, selected_root: PathBuf) -> Result<(), String> {
    use tauri::Manager;
    let state = app_handle.state::<SharedRuntimeState>();

    log::info!("Setting storage root to: {:?}", selected_root);

    let config = config::RuntimeConfig {
        storage_root: selected_root.to_string_lossy().to_string(),
        server_port: 3001,
        websocket_port: 3002,
        media_folders: config::MediaFolders {
            movies: "media/movies".to_string(),
            music: "media/music".to_string(),
            shows: "media/shows".to_string(),
            photos: "media/photos".to_string(),
            drive: "media/drive".to_string(),
        },
    };

    if let Err(e) = config::validate_config(&config) {
        return Err(e);
    }

    // Persist choice in bootstrap.json
    let mut bootstrap_cfg = config::BootstrapConfig::load_or_default();
    bootstrap_cfg.storage_root = Some(config.storage_root.clone());
    if let Err(e) = bootstrap_cfg.save() {
        return Err(format!("Failed to save bootstrap config: {}", e));
    }

    // Setup storage and database
    let repair_result = storage::ensure_layout(&selected_root)
        .map_err(|e| format!("Failed to create storage layout: {}", e))?;
    let loaded_config = config::load_or_create(&selected_root)
        .map_err(|e| format!("Failed to load config: {}", e))?;
    let mut db_conn = database::initialize(&selected_root, &loaded_config)
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    let indexed_media = media::scan_media(&selected_root, &loaded_config)
        .map_err(|e| format!("Failed to scan media: {}", e))?;
    database::write_media_items(&mut db_conn, &indexed_media)
        .map_err(|e| format!("Failed to write media: {}", e))?;

    // Update runtime state
    {
        let mut state_lock = state.lock().unwrap();
        state_lock.storage_root = selected_root;
        state_lock.config = loaded_config;
        state_lock.filesystem_repaired_paths = repair_result.created_paths;
        state_lock.indexed_media_count = indexed_media.len();
        state_lock.db_conn = Arc::new(Mutex::new(db_conn));
        state_lock.is_configured = true;
        state_lock.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
        state_lock.last_repair_at = Some(chrono::Utc::now().to_rfc3339());
        state_lock.background_workers_started = false;
        state_lock.active_transcodes.clear();

        // Broadcast RUNTIME_READY and FILESYSTEM_REPAIRED to websocket
        if let Some(ref tx) = state_lock.event_tx {
            let r_info = serde_json::json!({
              "runtimeVersion": "0.1.0",
              "storageRoot": state_lock.storage_root.to_string_lossy().to_string(),
              "serverPort": state_lock.config.server_port,
              "websocketPort": state_lock.config.websocket_port,
              "runtimeStatus": "ready",
              "filesystemStatus": "ready",
              "databaseStatus": "ready",
              "lastScanAt": state_lock.last_scan_at.clone(),
              "lastRepairAt": state_lock.last_repair_at.clone(),
            });
            let _ = tx.send(
                serde_json::json!({
                  "type": "RUNTIME_READY",
                  "timestamp": chrono::Utc::now().to_rfc3339(),
                  "runtime": r_info
                })
                .to_string(),
            );
        }
    }

    ensure_background_systems(app_handle);
    // Trigger an initial media scan to populate categories
    request_scan(app_handle);
    Ok(())
}

pub fn start_services(app_handle: &tauri::AppHandle) {
    use tauri::Manager;

    let state = app_handle.state::<SharedRuntimeState>();
    let mut state_lock = state.lock().unwrap();

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    state_lock.shutdown_tx = Some(shutdown_tx);

    let server_shared = state.inner().clone();
    let cfg = state_lock.config.clone();

    // Clone app handle to use inside the spawned task if needed
    let handle_clone = app_handle.clone();
    drop(state_lock);

    // Warp/Hyper need a Tokio reactor. The standalone dev_server creates one
    // explicitly, so do the same for the Tauri entrypoint instead of relying on
    // Tauri's app runtime semantics.
    if let Err(error) = std::thread::Builder::new()
        .name("mediagrid-runtime".to_string())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(4)
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    log::error!("Failed to build MediaGrid Tokio runtime: {error}");
                    return;
                }
            };

            runtime.block_on(async move {
                crate::server::start_servers(
                    server_shared,
                    cfg.server_port,
                    cfg.websocket_port,
                    shutdown_rx,
                    Some(handle_clone),
                )
                .await;
            });
        })
    {
        log::error!("Failed to spawn MediaGrid runtime thread: {error}");
    }
}

pub fn ensure_background_systems(app_handle: &tauri::AppHandle) {
    use tauri::Manager;

    let shared = app_handle.state::<SharedRuntimeState>();
    let mut state = shared.lock().unwrap();

    if !state.is_configured || state.background_workers_started {
        return;
    }

    let Some(shutdown_tx) = state.shutdown_tx.clone() else {
        return;
    };

    let Some(_event_tx) = state.event_tx.clone() else {
        return;
    };

    let shutdown_rx = shutdown_tx.subscribe();
    let shared_state = shared.inner().clone();
    let job_manager = jobs::start_job_manager(shared_state.clone(), shutdown_rx.clone());
    state.job_manager = Some(job_manager.clone());
    state.background_workers_started = true;
    drop(state);

    watcher::start_watcher(
        shared_state.clone(),
        job_manager.clone(),
        shutdown_rx.clone(),
    );

    // Start the 24-hour periodic cleanup scheduler
    jobs::start_cleanup_scheduler(job_manager, shutdown_rx.clone());

    // Start transcode monitor & session cleanup loop
    crate::transcoding::transcode_monitor::start_transcode_monitor(shared_state, shutdown_rx);
}

pub fn start_headless_background_systems(
    shared: SharedRuntimeState,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let mut state = shared.lock().unwrap();

    if !state.is_configured || state.background_workers_started {
        return;
    }

    let Some(_event_tx) = state.event_tx.clone() else {
        return;
    };

    let job_manager = jobs::start_job_manager(shared.clone(), shutdown_rx.clone());
    state.job_manager = Some(job_manager.clone());
    state.background_workers_started = true;
    drop(state);

    let shared_for_scan = shared.clone();
    watcher::start_watcher(shared.clone(), job_manager.clone(), shutdown_rx.clone());
    jobs::start_cleanup_scheduler(job_manager.clone(), shutdown_rx.clone());
    crate::transcoding::transcode_monitor::start_transcode_monitor(shared, shutdown_rx);
    if let Err(error) = scan_library_now(&shared_for_scan) {
        log::error!("Headless startup scan failed: {error}");
    }
    job_manager.enqueue_scan();
}

pub fn scan_library_now(shared: &SharedRuntimeState) -> Result<usize, String> {
    let (root, config, db_conn) = {
        let state = shared.lock().unwrap();
        (
            state.storage_root.clone(),
            state.config.clone(),
            state.db_conn.clone(),
        )
    };

    let mut items = media::scan_media(&root, &config)
        .map_err(|error| format!("Failed to scan media folders: {error}"))?;

    for item in &mut items {
        if let Ok(thumbnail_path) = thumbnails::generate_thumbnail(&root, item) {
            item.thumbnail_path = thumbnail_path;
        }
    }

    {
        let mut conn = db_conn.lock().unwrap();
        database::write_media_items(&mut conn, &items)
            .map_err(|error| format!("Failed to write media index: {error}"))?;
    }

    let indexed_count = items.len();
    {
        let mut state = shared.lock().unwrap();
        state.indexed_media_count = indexed_count;
        state.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
        state.scan_progress = 1.0;
        state.indexing_progress = 1.0;
        state.is_scanning = false;
    }

    for category in ["movies", "music", "shows", "photos", "drive"] {
        let item_count = {
            let state = shared.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            database::query_category_counts(&*conn)
                .map(|counts| counts.get(category).copied().unwrap_or(0))
                .unwrap_or(0)
        };

        let name = match category {
            "movies" => "Movies",
            "music" => "Music",
            "shows" => "Shows",
            "photos" => "Photos",
            "drive" => "Drive",
            _ => category,
        };

        crate::sync::emit(
            shared,
            "CATEGORY_UPDATED",
            serde_json::json!({
              "id": category,
              "name": name,
              "folder": format!("media/{category}"),
              "itemCount": item_count,
              "lastScannedAt": chrono::Utc::now().to_rfc3339(),
            }),
        );
    }

    Ok(indexed_count)
}

pub fn request_scan(app_handle: &tauri::AppHandle) {
    use tauri::Manager;

    let shared = app_handle.state::<SharedRuntimeState>();
    let job_manager = {
        let state = shared.lock().unwrap();
        state.job_manager.clone()
    };

    if let Some(job_manager) = job_manager {
        job_manager.enqueue_scan();
    }
}

pub fn record_api_request(app_handle: &tauri::AppHandle) {
    use tauri::Manager;

    let shared = app_handle.state::<SharedRuntimeState>();
    let mut state = shared.lock().unwrap();
    state.api_requests = state.api_requests.saturating_add(1);
}

pub fn runtime_info(
    state: &RuntimeState,
    server_port: u16,
    websocket_port: u16,
) -> serde_json::Value {
    serde_json::json!({
      "runtimeVersion": "0.1.0",
      "storageRoot": state.storage_root.to_string_lossy().to_string(),
      "serverPort": server_port,
      "websocketPort": websocket_port,
      "runtimeStatus": if state.is_scanning { "scanning" } else { "ready" },
      "filesystemStatus": "ready",
      "databaseStatus": if crate::database::check_health(&state.storage_root) { "ready" } else { "error" },
      "lastScanAt": state.last_scan_at.clone(),
      "lastRepairAt": state.last_repair_at.clone(),
      "activeJobs": state.active_jobs,
      "scanProgress": state.scan_progress,
      "indexingProgress": state.indexing_progress,
      "apiRequests": state.api_requests,
      "activeConnections": state.active_connections.len(),
    })
}

pub fn stop_services(state: &SharedRuntimeState) {
    let mut state_lock = state.lock().unwrap();
    if let Some(tx) = state_lock.shutdown_tx.take() {
        let _ = tx.send(true);
    }
    // Kill active transcode processes to avoid storage bloat or CPU usage leaks
    for (session_id, mut child) in state_lock.active_transcodes.drain() {
        log::info!("Killing active transcode process for session: {}", session_id);
        let _ = child.kill();
    }
    state_lock.background_workers_started = false;
    state_lock.job_manager = None;
}

pub fn restart_runtime(app_handle: &tauri::AppHandle) {
    use tauri::Manager;

    log::info!("Restarting runtime services...");
    let state = app_handle.state::<SharedRuntimeState>();

    // Stop existing services
    stop_services(&state);

    // Sleep briefly to let the ports release
    std::thread::sleep(std::time::Duration::from_millis(600));

    // Re-bootstrap configuration, repair filesystem, database and scan files
    let storage_root = {
        let state_lock = state.lock().unwrap();
        state_lock.storage_root.clone()
    };

    let repair_result =
        storage::ensure_layout(&storage_root).expect("failed to initialize storage");
    let config = config::load_or_create(&storage_root).expect("failed to load runtime config");
    let db_conn =
        database::initialize(&storage_root, &config).expect("failed to initialize database");

    let last_repair = if !repair_result.created_paths.is_empty() {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    // Update state
    {
        let mut state_lock = state.lock().unwrap();
        state_lock.config = config;
        state_lock.filesystem_repaired_paths = repair_result.created_paths;
        state_lock.indexed_media_count = 0;
        state_lock.active_connections.clear();
        state_lock.last_scan_at = None;
        state_lock.db_conn = Arc::new(Mutex::new(db_conn));
        state_lock.is_scanning = false;
        state_lock.scan_progress = 0.0;
        state_lock.indexing_progress = 0.0;
        state_lock.active_transcodes.clear();
        if last_repair.is_some() {
            state_lock.last_repair_at = last_repair;
        }

        // Emit FILESYSTEM_REPAIRED if directories were repaired on restart
        if !state_lock.filesystem_repaired_paths.is_empty() {
            let paths: Vec<String> = state_lock
                .filesystem_repaired_paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if let Some(ref tx) = state_lock.event_tx {
                let _ = tx.send(
                    serde_json::json!({
                      "type": "FILESYSTEM_REPAIRED",
                      "timestamp": chrono::Utc::now().to_rfc3339(),
                      "repairedPaths": paths
                    })
                    .to_string(),
                );
            }
        }
    }

    // Start services again
    start_services(app_handle);

    log::info!("Runtime services restarted successfully.");

    // Update tray menu dynamically
    if let Err(e) = crate::tray::update_tray_menu(app_handle) {
        log::error!("Failed to update tray menu on restart: {:?}", e);
    }
}
