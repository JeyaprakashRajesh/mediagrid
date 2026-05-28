use serde::Serialize;
use std::net::SocketAddr;
use tokio::sync::broadcast::Sender;
use warp::Filter;

use crate::database;
use crate::runtime::SharedRuntimeState;

#[derive(Debug, serde::Serialize, Clone)]
pub enum AuthError {
    MissingHeader,
    InvalidHeader,
    InvalidToken(String),
    UserNotFound,
    Unauthorized,
    RateLimited(u64),
}

impl warp::reject::Reject for AuthError {}

fn extract_token_from_header_or_query() -> impl Filter<Extract = (String,), Error = warp::Rejection> + Clone {
    warp::header::optional::<String>("authorization")
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and_then(|auth_header: Option<String>, query: std::collections::HashMap<String, String>| async move {
            if let Some(header_val) = auth_header {
                if header_val.starts_with("Bearer ") {
                    return Ok(header_val[7..].to_string());
                }
            }
            if let Some(token) = query.get("token") {
                return Ok(token.clone());
            }
            if let Some(token) = query.get("sessionId") {
                return Ok(token.clone());
            }
            Err(warp::reject::custom(AuthError::MissingHeader))
        })
}

fn with_auth(
    shared: SharedRuntimeState,
    required_role: &'static str,
) -> impl Filter<Extract = (crate::auth::Claims,), Error = warp::Rejection> + Clone {
    extract_token_from_header_or_query()
        .and(warp::any().map(move || (shared.clone(), required_role)))
        .and_then(|token: String, (shared, req_role): (SharedRuntimeState, &'static str)| async move {
            let (conn, is_configured) = {
                let state = shared.lock().unwrap();
                (state.db_conn.clone(), state.is_configured)
            };
            let conn_lock = conn.lock().unwrap();

            if !is_configured {
                // Bypass auth during setup phase
                let dummy_claims = crate::auth::Claims {
                    sub: "setup-admin".to_string(),
                    username: "admin".to_string(),
                    role: "Admin".to_string(),
                    exp: 0,
                };
                return Ok(dummy_claims);
            }

            // Validate token & session in database
            let session = match crate::sessions::validate_user_session(&*conn_lock, &token) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Session validation failed: {}", e);
                    return Err(warp::reject::custom(AuthError::InvalidToken(e)));
                }
            };

            // Get user to verify role
            let user = match crate::database::get_user_by_id(&*conn_lock, &session.userId) {
                Ok(Some(u)) => u,
                _ => return Err(warp::reject::custom(AuthError::UserNotFound)),
            };

            if !crate::access::is_authorized(&user.role, req_role) {
                return Err(warp::reject::custom(AuthError::Unauthorized));
            }

            // Return claims
            let claims = crate::auth::Claims {
                sub: user.id,
                username: user.username,
                role: user.role,
                exp: 0,
            };

            Ok(claims)
        })
}

#[derive(Serialize)]
#[allow(non_snake_case)]
struct HealthResponse {
    runtimeStatus: String,
    filesystemStatus: String,
    databaseStatus: String,
    websocketConnected: bool,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
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
#[allow(non_snake_case)]
struct CategoryDefinition {
    id: String,
    name: String,
    folder: String,
    itemCount: usize,
    lastScannedAt: Option<String>,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
pub struct MediaItemResponse {
    pub id: String,
    pub title: String,
    pub path: String,
    pub kind: String,
    pub category: String,
    pub createdAt: String,
    pub updatedAt: String,
    pub indexedAt: String,
    pub modifiedAt: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mimeType: Option<String>,
    pub sizeBytes: Option<u64>,
    pub thumbnailPath: Option<String>,
    pub duration: Option<f64>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub bitrate: Option<u64>,
    pub fps: Option<f64>,
    pub sampleRate: Option<u32>,
    pub format: Option<String>,
    pub hash: Option<String>,
}

#[derive(serde::Deserialize)]
struct UploadQuery {
    category: String,
    path: Option<String>,
}

#[derive(serde::Deserialize)]
struct CreateDirectoryRequest {
    category: String,
    path: String,
}

#[derive(serde::Deserialize)]
#[allow(non_snake_case)]
struct RenameRequest {
    category: String,
    oldPath: String,
    newPath: String,
}

#[derive(serde::Deserialize)]
struct DeleteRequest {
    category: String,
    path: String,
}

async fn handle_upload(
    shared: SharedRuntimeState,
    query: UploadQuery,
    form: warp::multipart::FormData,
) -> Result<impl warp::Reply, warp::Rejection> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;
    use bytes::Buf;

    let (storage_root, media_folders) = {
        let state = shared.lock().unwrap();
        (state.storage_root.clone(), state.config.media_folders.clone())
    };

    let relative_category_folder = match query.category.as_str() {
        "movies" => &media_folders.movies,
        "music" => &media_folders.music,
        "shows" => &media_folders.shows,
        "photos" => &media_folders.photos,
        "drive" => &media_folders.drive,
        _ => return Err(warp::reject::reject()),
    };

    let category_root = storage_root.join(relative_category_folder);

    let subpath = query.path.unwrap_or_default();
    let decoded_subpath = percent_decode(&subpath);
    let target_dir = category_root.join(&decoded_subpath);

    if let Err(e) = std::fs::create_dir_all(&target_dir) {
        log::error!("Failed to create directory {:?}: {}", target_dir, e);
        return Err(warp::reject::reject());
    }

    let mut parts = form;
    let mut uploaded_files = Vec::new();

    while let Some(part_result) = parts.next().await {
        let mut part: warp::multipart::Part = part_result.map_err(|e| {
            log::error!("Form parts extraction error: {}", e);
            warp::reject::reject()
        })?;

        let filename = part.filename().map(|s| s.to_string());
        if let Some(name) = filename {
            if name.is_empty() {
                continue;
            }
            let file_path = target_dir.join(&name);
            
            let mut file = match tokio::fs::File::create(&file_path).await {
                Ok(f) => f,
                Err(e) => {
                    log::error!("Failed to create file {:?}: {}", file_path, e);
                    return Err(warp::reject::reject());
                }
            };

            while let Some(chunk_result) = part.data().await {
                let mut chunk = chunk_result.map_err(|e| {
                    log::error!("Part data error: {}", e);
                    warp::reject::reject()
                })?;
                
                while chunk.has_remaining() {
                    let bytes = chunk.chunk();
                    if let Err(e) = file.write_all(bytes).await {
                        log::error!("Failed to write to file {:?}: {}", file_path, e);
                        return Err(warp::reject::reject());
                    }
                    let len = bytes.len();
                    chunk.advance(len);
                }
            }

            uploaded_files.push(file_path);
        }
    }

    let mut indexed_items = Vec::new();
    let job_manager = {
        let state = shared.lock().unwrap();
        state.job_manager.clone()
    };

    if let Some(jm) = job_manager {
        let indexer = crate::indexing::IndexingService::new(shared.clone());
        for file_path in uploaded_files {
            match indexer.index_path(file_path.clone(), query.category.clone()).await {
                Ok(item) => {
                    indexed_items.push(item.id.clone());
                    jm.enqueue_thumbnail(item.id);
                }
                Err(e) => {
                    log::error!("Failed to index uploaded file {:?}: {}", file_path, e);
                }
            }
        }
        jm.enqueue_scan(); 
    }

    Ok(warp::reply::json(&serde_json::json!({
        "status": "success",
        "indexed": indexed_items
    })))
}

pub fn get_routes(
    shared: SharedRuntimeState,
    server_port: u16,
    websocket_port: u16,
    tx: Sender<String>,
    app_handle: Option<tauri::AppHandle>,
) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let rest = warp::path::end().map(|| warp::reply::html("MediaGrid runtime"));

    let shared_health = shared.clone();
    let health_route = warp::path("health").and(warp::get()).map(move || {
        let state = shared_health.lock().unwrap();
        if !state.is_configured {
            let body = HealthResponse {
                runtimeStatus: "unconfigured".to_string(),
                filesystemStatus: "unconfigured".to_string(),
                databaseStatus: "unconfigured".to_string(),
                websocketConnected: !state.active_connections.is_empty(),
            };
            return warp::reply::json(&body);
        }
        let db_ok = crate::database::check_health(&state.storage_root);
        let body = HealthResponse {
            runtimeStatus: "ready".to_string(),
            filesystemStatus: "ready".to_string(),
            databaseStatus: if db_ok {
                "ready".to_string()
            } else {
                "error".to_string()
            },
            websocketConnected: !state.active_connections.is_empty(),
        };
        warp::reply::json(&body)
    });

    let shared_runtime = shared.clone();
    let runtime_route = warp::path("runtime").and(warp::get()).map(move || {
        let state = shared_runtime.lock().unwrap();
        if !state.is_configured {
            let body = RuntimeInfo {
                runtimeVersion: "0.1.0".to_string(),
                storageRoot: "".to_string(),
                serverPort: server_port,
                websocketPort: websocket_port,
                runtimeStatus: "unconfigured".to_string(),
                filesystemStatus: "unconfigured".to_string(),
                databaseStatus: "unconfigured".to_string(),
                lastScanAt: None,
                lastRepairAt: None,
            };
            return warp::reply::json(&body);
        }
        let db_ok = crate::database::check_health(&state.storage_root);
        let body = RuntimeInfo {
            runtimeVersion: "0.1.0".to_string(),
            storageRoot: state.storage_root.to_string_lossy().to_string(),
            serverPort: server_port,
            websocketPort: websocket_port,
            runtimeStatus: if state.is_scanning {
                "scanning".to_string()
            } else {
                "ready".to_string()
            },
            filesystemStatus: "ready".to_string(),
            databaseStatus: if db_ok {
                "ready".to_string()
            } else {
                "error".to_string()
            },
            lastScanAt: state.last_scan_at.clone(),
            lastRepairAt: state.last_repair_at.clone(),
        };
        warp::reply::json(&body)
    });

    let shared_categories = shared.clone();
    let categories_route = warp::path("categories")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .map(move |_claims| {
            let state = shared_categories.lock().unwrap();
            let conn_lock = state.db_conn.lock().unwrap();
            let counts = database::query_category_counts(&*conn_lock).unwrap_or_default();

            let movies_count = *counts.get("movies").unwrap_or(&0);
            let music_count = *counts.get("music").unwrap_or(&0);
            let shows_count = *counts.get("shows").unwrap_or(&0);
            let photos_count = *counts.get("photos").unwrap_or(&0);
            let drive_count = *counts.get("drive").unwrap_or(&0);

            let categories = vec![
                CategoryDefinition {
                    id: "movies".into(),
                    name: "Movies".into(),
                    folder: "media/movies".into(),
                    itemCount: movies_count,
                    lastScannedAt: state.last_scan_at.clone(),
                },
                CategoryDefinition {
                    id: "music".into(),
                    name: "Music".into(),
                    folder: "media/music".into(),
                    itemCount: music_count,
                    lastScannedAt: state.last_scan_at.clone(),
                },
                CategoryDefinition {
                    id: "shows".into(),
                    name: "Shows".into(),
                    folder: "media/shows".into(),
                    itemCount: shows_count,
                    lastScannedAt: state.last_scan_at.clone(),
                },
                CategoryDefinition {
                    id: "photos".into(),
                    name: "Photos".into(),
                    folder: "media/photos".into(),
                    itemCount: photos_count,
                    lastScannedAt: state.last_scan_at.clone(),
                },
                CategoryDefinition {
                    id: "drive".into(),
                    name: "Drive".into(),
                    folder: "media/drive".into(),
                    itemCount: drive_count,
                    lastScannedAt: state.last_scan_at.clone(),
                },
            ];

            warp::reply::json(
                &serde_json::json!({ "categories": categories, "total": categories.len() }),
            )
        });

    let shared_for_media = shared.clone();
    let media_route = warp::path("media")
        .and(warp::path::param::<String>())
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |category: String, _claims| {
            let shared = shared_for_media.clone();
            async move {
                let state = shared.lock().unwrap();
                let conn_lock = state.db_conn.lock().unwrap();
                let items = database::query_media_by_category(&*conn_lock, &category).unwrap_or_default();

                let response_items: Vec<MediaItemResponse> = items
                    .into_iter()
                    .map(|it| MediaItemResponse {
                        id: it.id,
                        title: it.title,
                        path: it.path.to_string_lossy().to_string(),
                        kind: it.kind,
                        category: it.category,
                        createdAt: it.created_at,
                        updatedAt: it.updated_at,
                        indexedAt: it.indexed_at,
                        modifiedAt: it.modified_at,
                        artist: it.artist,
                        album: it.album,
                        mimeType: it.mime_type,
                        sizeBytes: it.size_bytes,
                        thumbnailPath: it.thumbnail_path,
                        duration: it.duration,
                        resolution: it.resolution,
                        codec: it.codec,
                        bitrate: it.bitrate,
                        fps: it.fps,
                        sampleRate: it.sample_rate,
                        format: it.format,
                        hash: it.hash,
                    })
                    .collect();

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "category": category, "items": response_items, "total": response_items.len() })))
            }
        });

    let shared_media_details = shared.clone();
    let media_details_route = warp::path!("media" / "details" / String)
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |id: String, _claims| {
            let shared = shared_media_details.clone();
            async move {
                let state = shared.lock().unwrap();
                let conn = state.db_conn.lock().unwrap();
                let media = database::get_media_by_id(&*conn, &id)
                    .map_err(|_| warp::reject::not_found())?;

                let Some(media) = media else {
                    return Err(warp::reject::not_found());
                };

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "media": {
                        "id": media.id,
                        "title": media.title,
                        "path": media.path.to_string_lossy().to_string(),
                        "kind": media.kind,
                        "category": media.category,
                        "createdAt": media.created_at,
                        "updatedAt": media.updated_at,
                        "indexedAt": media.indexed_at,
                        "modifiedAt": media.modified_at,
                        "artist": media.artist,
                        "album": media.album,
                        "mimeType": media.mime_type,
                        "sizeBytes": media.size_bytes,
                        "thumbnailPath": media.thumbnail_path,
                        "duration": media.duration,
                        "resolution": media.resolution,
                        "codec": media.codec,
                        "bitrate": media.bitrate,
                        "fps": media.fps,
                        "sampleRate": media.sample_rate,
                        "format": media.format,
                        "hash": media.hash,
                    },
                    "thumbnail": media.thumbnail_path,
                    "runtime": crate::runtime::runtime_info(&state, server_port, websocket_port),
                })))
            }
        });

    let shared_scan = shared.clone();
    let app_handle_scan = app_handle.clone();
    let scan_route = warp::path("scan")
        .and(warp::post())
        .and(with_auth(shared.clone(), "Admin"))
        .map(move |_claims| {
            if let Some(ref handle) = app_handle_scan {
                crate::runtime::request_scan(handle);
                let state = shared_scan.lock().unwrap();
                warp::reply::json(
                    &serde_json::json!({"status": "queued", "activeJobs": state.active_jobs}),
                )
            } else {
                match crate::runtime::scan_library_now(&shared_scan) {
                    Ok(indexed) => warp::reply::json(
                        &serde_json::json!({"status": "completed", "indexed": indexed}),
                    ),
                    Err(error) => {
                        warp::reply::json(&serde_json::json!({"status": "error", "message": error}))
                    }
                }
            }
        });

    let shared_jobs = shared.clone();
    let jobs_route = warp::path("jobs")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Admin"))
        .map(move |_claims| {
            let state = shared_jobs.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            let jobs = database::query_jobs(&*conn).unwrap_or_default();
            warp::reply::json(&serde_json::json!({"jobs": jobs, "activeJobs": state.active_jobs}))
        });

    let shared_stats = shared.clone();
    let stats_route = warp::path("stats")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Admin"))
        .map(move |_claims| {
            let state = shared_stats.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            let counts = database::query_category_counts(&*conn).unwrap_or_default();
            let started_at = chrono::DateTime::parse_from_rfc3339(&state.started_at)
                .map(|value| value.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());
            let uptime_seconds = chrono::Utc::now()
                .signed_duration_since(started_at)
                .num_seconds()
                .max(0) as u64;

            let active_sessions = database::query_active_playback_sessions(&*conn).unwrap_or_default();
            let active_sessions_count = active_sessions.len();
            let bandwidth = crate::bandwidth::get_bandwidth_stats(active_sessions_count);

            warp::reply::json(&serde_json::json!({
                "uptimeSeconds": uptime_seconds,
                "activeJobs": state.active_jobs,
                "scanProgress": state.scan_progress,
                "indexingProgress": state.indexing_progress,
                "websocketConnections": state.active_connections.len(),
                "apiRequests": state.api_requests,
                "indexedMediaCount": state.indexed_media_count,
                "categoryCounts": counts,
                "activeSessions": active_sessions_count,
                "bandwidth": bandwidth,
            }))
        });

    let shared_for_thumbnail = shared.clone();
    let thumbnail_route = warp::path!("media" / "thumbnail" / String)
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |id: String, _claims| {
            let shared = shared_for_thumbnail.clone();
            async move {
                let root = {
                    let state = shared.lock().unwrap();
                    state.storage_root.clone()
                };
                let final_path = root.join("cache/thumbnails").join(format!("{}.jpg", id));

                if !final_path.exists() || !final_path.is_file() {
                    return Err(warp::reject::not_found());
                }

                let bytes = std::fs::read(&final_path).map_err(|_| warp::reject::not_found())?;
                Ok::<_, warp::Rejection>(warp::reply::with_header(
                    bytes,
                    "content-type",
                    "image/jpeg",
                ))
            }
        });

    let shared_media_file = shared.clone();
    let media_file_route = warp::path("media-file")
        .and(warp::path::tail())
        .and(warp::header::optional::<String>("range"))
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |tail: warp::path::Tail, range_header: Option<String>, _claims| {
            let shared = shared_media_file.clone();
            async move {
                let path_str = tail.as_str();
                let decoded_path = percent_decode(path_str);
                let normalized = decoded_path.replace("\\", "/");
                let storage_root = {
                    let state = shared.lock().unwrap();
                    state.storage_root.clone()
                };
                let storage_root_text = storage_root.to_string_lossy().replace("\\", "/");
                let final_path = if normalized.starts_with(&storage_root_text) {
                    std::path::PathBuf::from(&normalized)
                } else {
                    storage_root.join(&normalized)
                };
                let final_path_text = final_path.to_string_lossy().replace("\\", "/");

                if !final_path_text.starts_with(&storage_root_text) {
                    return Err(warp::reject::not_found());
                }

                if !final_path.exists() || !final_path.is_file() {
                    return Err(warp::reject::not_found());
                }

                let bytes = std::fs::read(&final_path).map_err(|_| warp::reject::not_found())?;
                let file_size = bytes.len() as u64;

                let (status, response_body, content_range) = if let Some(range_header) = range_header {
                    if let Some(range_spec) = range_header.strip_prefix("bytes=") {
                        let mut parts = range_spec.splitn(2, '-');
                        let start_part = parts.next().unwrap_or("").trim();
                        let end_part = parts.next().unwrap_or("").trim();

                        let (start, end) = if start_part.is_empty() {
                            let suffix_len = end_part.parse::<u64>().map_err(|_| warp::reject::not_found())?;
                            let start = file_size.saturating_sub(suffix_len);
                            (start, file_size.saturating_sub(1))
                        } else {
                            let start = start_part.parse::<u64>().map_err(|_| warp::reject::not_found())?;
                            let end = if end_part.is_empty() {
                                file_size.saturating_sub(1)
                            } else {
                                end_part.parse::<u64>().map_err(|_| warp::reject::not_found())?
                            };
                            (start, end.min(file_size.saturating_sub(1)))
                        };

                        if file_size == 0 || start >= file_size || end < start {
                            return Err(warp::reject::not_found());
                        }

                        let start_idx = start as usize;
                        let end_idx = end as usize;
                        let partial = bytes[start_idx..=end_idx].to_vec();
                        (
                            warp::http::StatusCode::PARTIAL_CONTENT,
                            partial,
                            Some(format!("bytes {start}-{end}/{file_size}")),
                        )
                    } else {
                        (warp::http::StatusCode::OK, bytes, None)
                    }
                } else {
                    (warp::http::StatusCode::OK, bytes, None)
                };

                let extension = final_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();

                let mime = match extension.as_str() {
                    "mp4" => "video/mp4",
                    "mkv" => "video/x-matroska",
                    "avi" => "video/x-msvideo",
                    "mov" => "video/quicktime",
                    "wmv" => "video/x-ms-wmv",
                    "mp3" => "audio/mpeg",
                    "flac" => "audio/flac",
                    "wav" => "audio/wav",
                    "aac" => "audio/aac",
                    "ogg" => "audio/ogg",
                    "m4a" => "audio/mp4",
                    "jpg" | "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "webp" => "image/webp",
                    "gif" => "image/gif",
                    "bmp" => "image/bmp",
                    _ => "application/octet-stream",
                };

                let mut response = warp::http::Response::builder()
                    .status(status)
                    .header("content-type", mime)
                    .header("accept-ranges", "bytes")
                    .header("content-length", response_body.len().to_string());

                if let Some(content_range) = content_range {
                    response = response.header("content-range", content_range);
                }

                let response = response
                    .body(response_body)
                    .map_err(|_| warp::reject::not_found())?;

                Ok::<_, warp::Rejection>(response)
            }
        });

    let setup_drives_route = warp::path!("setup" / "drives").and(warp::get()).map(|| {
        let drives = crate::storage::get_available_drives();
        warp::reply::json(&serde_json::json!({ "drives": drives }))
    });

    #[derive(serde::Deserialize)]
    struct SetupRequest {
        storage_root: String,
    }

    let app_handle_setup = app_handle.clone();
    let setup_route = warp::path("setup")
        .and(warp::post())
        .and(warp::body::json())
        .map(move |req: SetupRequest| {
            let handle = app_handle_setup.clone();
            if let Some(ref h) = handle {
                match crate::runtime::setup_runtime(h, std::path::PathBuf::from(&req.storage_root)) {
                    Ok(_) => {
                        warp::reply::with_status(
                            warp::reply::json(&serde_json::json!({ "status": "success", "message": "Runtime successfully configured" })),
                            warp::http::StatusCode::OK
                        )
                    }
                    Err(e) => {
                        warp::reply::with_status(
                            warp::reply::json(&serde_json::json!({ "status": "error", "message": e })),
                            warp::http::StatusCode::BAD_REQUEST
                        )
                    }
                }
            } else {
                warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({ "status": "error", "message": "App handle not available" })),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR
                )
            }
        });

    let shared_stream = shared.clone();
    let stream_start_route = warp::path!("stream" / String)
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |media_id: String, query: std::collections::HashMap<String, String>, _claims| {
            let shared = shared_stream.clone();
            async move {
                let device_id = query.get("deviceId").cloned().unwrap_or_else(|| "web-browser".to_string());
                let (storage_root, db_conn) = {
                    let state = shared.lock().unwrap();
                    (state.storage_root.clone(), state.db_conn.clone())
                };

                let conn = db_conn.lock().unwrap();
                let media = match crate::database::get_media_by_id(&*conn, &media_id) {
                    Ok(Some(m)) => m,
                    Ok(None) => return Err(warp::reject::not_found()),
                    Err(_) => return Err(warp::reject::not_found()),
                };

                if !media.path.exists() {
                    return Err(warp::reject::not_found());
                }

                let session_id = uuid::Uuid::new_v4().to_string();
                let should_transcode = crate::streaming::should_transcode(&media);
                let mode_str = if should_transcode { "transcode" } else { "direct" };

                let _ = crate::sessions::start_session(&*conn, session_id.clone(), media_id.clone(), device_id.clone());

                let stream_url = if should_transcode {
                    let stream_dir = storage_root.join("cache/streams").join(&session_id);
                    let _ = crate::hls::create_master_playlist(&stream_dir);

                    let job = crate::database::TranscodingJobRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        mediaId: media.id.clone(),
                        status: "pending".to_string(),
                        quality: "auto".to_string(),
                        createdAt: chrono::Utc::now().to_rfc3339(),
                    };
                    let _ = crate::database::insert_transcoding_job(&*conn, &job);

                    format!("/hls/{}/master.m3u8", session_id)
                } else {
                    let encoded_path = percent_encode_path(&media.path.to_string_lossy());
                    format!("/media-file/{}", encoded_path)
                };

                drop(conn);

                crate::sync::emit(&shared, "STREAM_STARTED", serde_json::json!({
                    "sessionId": session_id,
                    "mediaId": media_id,
                    "deviceId": device_id,
                    "mode": mode_str,
                    "streamUrl": stream_url,
                }));

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "sessionId": session_id,
                    "mediaId": media_id,
                    "mode": mode_str,
                    "streamUrl": stream_url,
                })))
            }
        });

    let shared_hls = shared.clone();
    let hls_serve_route = warp::path("hls")
        .and(warp::path::param::<String>()) // session_id
        .and(warp::path::tail())           // path_tail
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |session_id: String, tail: warp::path::Tail, _claims| {
            let shared = shared_hls.clone();
            async move {
                let tail_str = tail.as_str().replace("\\", "/");
                let (storage_root, db_conn) = {
                    let state = shared.lock().unwrap();
                    (state.storage_root.clone(), state.db_conn.clone())
                };

                let file_path = storage_root.join("cache/streams").join(&session_id).join(&tail_str);

                if tail_str.ends_with("manifest.m3u8") {
                    let parts: Vec<&str> = tail_str.split('/').collect();
                    if parts.len() >= 2 {
                        let quality = parts[parts.len() - 2];
                        let mut state = shared.lock().unwrap();
                        let conn = db_conn.lock().unwrap();
                        
                        let session = crate::database::get_playback_session(&*conn, &session_id)
                            .unwrap_or(None);

                        if let Some(session) = session {
                            let media = crate::database::get_media_by_id(&*conn, &session.mediaId)
                                .unwrap_or(None);

                            if let Some(media) = media {
                                let key = format!("{}_{}", session_id, quality);
                                if !state.active_transcodes.contains_key(&key) {
                                    let mut keys_to_remove = Vec::new();
                                    for k in state.active_transcodes.keys() {
                                        if k.starts_with(&format!("{}_", session_id)) {
                                            keys_to_remove.push(k.clone());
                                        }
                                    }
                                    for k in keys_to_remove {
                                        if let Some(mut child) = state.active_transcodes.remove(&k) {
                                            let _ = child.kill();
                                        }
                                    }

                                    let manifest_dir = storage_root.join("cache/streams").join(&session_id).join(quality);
                                    let _ = std::fs::create_dir_all(&manifest_dir);
                                    let manifest_path = manifest_dir.join("manifest.m3u8");

                                    let copy_codecs = crate::streaming::can_copy_codecs(&media);
                                    if let Ok(child) = crate::transcoding::spawn_hls_transcode(
                                        &media.path,
                                        &manifest_path,
                                        quality,
                                        copy_codecs,
                                    ) {
                                        state.active_transcodes.insert(key, child);

                                        // Update database status of transcoding job to 'processing'
                                        if let Ok(jobs) = crate::database::query_transcoding_jobs(&*conn) {
                                            if let Some(job) = jobs.into_iter().find(|j| j.mediaId == media.id && j.status == "pending") {
                                                let _ = crate::database::update_transcoding_job_status(&*conn, &job.id, "processing");
                                            }
                                        }
                                        drop(conn);
                                        drop(state);
                                        crate::sync::emit(&shared, "TRANSCODE_STARTED", serde_json::json!({
                                            "sessionId": session_id,
                                            "quality": quality,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }

                let mut retries = 15;
                while !file_path.exists() && retries > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
                    retries -= 1;
                }

                if !file_path.exists() {
                    return Err(warp::reject::not_found());
                }

                let bytes = std::fs::read(&file_path).map_err(|_| warp::reject::not_found())?;
                let extension = file_path.extension().and_then(|e| e.to_str()).unwrap_or_default();
                let mime = match extension {
                    "m3u8" => "application/x-mpegURL",
                    "ts" => "video/MP2T",
                    _ => "application/octet-stream",
                };

                Ok::<_, warp::Rejection>(warp::reply::with_header(bytes, "content-type", mime))
            }
        });

    let shared_subtitles = shared.clone();
    let subtitles_route = warp::path!("subtitles" / String)
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |media_id: String, query: std::collections::HashMap<String, String>, _claims| {
            let shared = shared_subtitles.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };

                let conn = db_conn.lock().unwrap();
                let media = match crate::database::get_media_by_id(&*conn, &media_id) {
                    Ok(Some(m)) => m,
                    Ok(None) => return Err(warp::reject::not_found()),
                    Err(_) => return Err(warp::reject::not_found()),
                };

                use warp::Reply;

                let tracks = crate::subtitles::get_subtitles_for_media(&media.path);

                if let Some(track_idx_str) = query.get("track") {
                    if let Ok(track_idx) = track_idx_str.parse::<usize>() {
                        if let Some(track) = tracks.iter().find(|t| t.index == track_idx) {
                            let storage_root = {
                                let state = shared.lock().unwrap();
                                state.storage_root.clone()
                            };

                            let output_vtt = storage_root
                                .join("cache/subtitles")
                                .join(&media_id)
                                .join(format!("track_{}.vtt", track_idx));

                            if !output_vtt.exists() {
                                if track.is_embedded {
                                    crate::subtitles::extract_embedded_subtitle(&media.path, track_idx, &output_vtt)
                                        .map_err(|e| {
                                            log::error!("Failed to extract embedded subtitles: {}", e);
                                            warp::reject::not_found()
                                        })?;
                                } else if let Some(ref path) = track.path {
                                    crate::subtitles::convert_subtitle_to_vtt(std::path::Path::new(path), &output_vtt)
                                        .map_err(|e| {
                                            log::error!("Failed to convert subtitles: {}", e);
                                            warp::reject::not_found()
                                        })?;
                                }
                            }

                            if output_vtt.exists() {
                                let content = std::fs::read(&output_vtt).map_err(|_| warp::reject::not_found())?;
                                let reply = warp::reply::with_status(
                                    warp::reply::with_header(content, "content-type", "text/vtt"),
                                    warp::http::StatusCode::OK
                                );
                                return Ok::<_, warp::Rejection>(reply.into_response());
                            }
                        }
                    }
                    return Err(warp::reject::not_found());
                }

                let reply = warp::reply::with_status(
                    warp::reply::json(&serde_json::json!({ "tracks": tracks, "total": tracks.len() })),
                    warp::http::StatusCode::OK
                );
                Ok::<_, warp::Rejection>(reply.into_response())
            }
        });

    #[derive(serde::Deserialize)]
    struct ProgressRequest {
        mediaId: String,
        progress: f64,
    }

    let shared_progress = shared.clone();
    let watch_progress_route = warp::path!("watch" / "progress")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: ProgressRequest, _claims| {
            let shared = shared_progress.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };

                let conn = db_conn.lock().unwrap();
                let res = crate::watch::save_progress(&*conn, req.mediaId.clone(), req.progress);
                drop(conn);
                
                res.map_err(|_| warp::reject::not_found())?;

                crate::sync::emit(&shared, "WATCH_PROGRESS_UPDATED", serde_json::json!({
                    "mediaId": req.mediaId,
                    "progress": req.progress,
                }));

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    let shared_continue = shared.clone();
    let watch_continue_route = warp::path!("watch" / "continue")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |_claims| {
            let shared = shared_continue.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };

                let conn = db_conn.lock().unwrap();
                let items = crate::watch::get_continue_watching_items(&*conn)
                    .map_err(|_| warp::reject::not_found())?;

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "items": items, "total": items.len() })))
            }
        });

    // Authentication requests
    #[derive(serde::Deserialize)]
    struct LoginRequest {
        username: String,
        password: String,
        deviceName: Option<String>,
        platform: Option<String>,
        deviceId: Option<String>,
    }

    let shared_login = shared.clone();
    let login_route = warp::path!("auth" / "login")
        .and(warp::post())
        .and(warp::body::json())
        .and(warp::addr::remote())
        .and_then(move |req: LoginRequest, addr: Option<std::net::SocketAddr>| {
            let shared = shared_login.clone();
            async move {
                let ip = addr.map(|a| a.ip().to_string()).unwrap_or_else(|| "127.0.0.1".to_string());

                if let Some(secs) = crate::security::check_login_rate_limit(&ip) {
                    return Err(warp::reject::custom(AuthError::RateLimited(secs)));
                }

                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();

                let user_count = crate::database::count_users(&*conn_lock).unwrap_or(0);
                if user_count == 0 {
                    let hashed = crate::auth::hash_password(&req.password).map_err(|e| {
                        warp::reject::custom(AuthError::InvalidToken(e))
                    })?;
                    let new_user = crate::database::UserRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        username: req.username.clone(),
                        passwordHash: hashed,
                        role: "Admin".to_string(),
                        createdAt: chrono::Utc::now().to_rfc3339(),
                    };
                    crate::database::insert_user(&*conn_lock, &new_user).map_err(|e| {
                        warp::reject::custom(AuthError::InvalidToken(e.to_string()))
                    })?;
                }

                let user = match crate::database::get_user_by_username(&*conn_lock, &req.username) {
                    Ok(Some(u)) => u,
                    _ => {
                        crate::security::record_failed_login(&ip);
                        return Err(warp::reject::custom(AuthError::InvalidToken("Invalid credentials".to_string())));
                    }
                };

                let pass_ok = crate::auth::verify_password(&req.password, &user.passwordHash).unwrap_or(false);
                if !pass_ok {
                    crate::security::record_failed_login(&ip);
                    return Err(warp::reject::custom(AuthError::InvalidToken("Invalid credentials".to_string())));
                }

                crate::security::record_successful_login(&ip);

                let device_id = req.deviceId.clone().unwrap_or_else(|| "web-dashboard".to_string());
                let device_name = req.deviceName.clone().unwrap_or_else(|| "Web Client".to_string());
                let platform = req.platform.clone().unwrap_or_else(|| "Web".to_string());

                let is_first_device = crate::database::query_devices(&*conn_lock).map(|d| d.is_empty()).unwrap_or(true);

                let _device = crate::devices::register_device(
                    &*conn_lock,
                    &user.id,
                    &device_id,
                    &device_name,
                    &platform,
                    is_first_device || user.role == "Admin",
                ).map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;

                let session = crate::sessions::create_user_session(&*conn_lock, &user.id, &device_id)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "token": session.token,
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "role": user.role,
                    },
                    "device": {
                        "id": device_id,
                        "name": device_name,
                        "trusted": is_first_device || user.role == "Admin",
                    }
                })))
            }
        });

    let shared_logout = shared.clone();
    let logout_route = warp::path!("auth" / "logout")
        .and(warp::post())
        .and(extract_token_from_header_or_query())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |token: String, _claims| {
            let shared = shared_logout.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let _ = crate::sessions::revoke_user_session(&*conn_lock, &token);
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    let shared_refresh = shared.clone();
    let refresh_route = warp::path!("auth" / "refresh")
        .and(warp::post())
        .and(extract_token_from_header_or_query())
        .and_then(move |token: String| {
            let shared = shared_refresh.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                
                let session = crate::sessions::validate_user_session(&*conn_lock, &token)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;

                let user_id = session.userId;
                let device_id = session.deviceId;
                
                let _ = crate::sessions::revoke_user_session(&*conn_lock, &token);

                let new_session = crate::sessions::create_user_session(&*conn_lock, &user_id, &device_id)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "token": new_session.token,
                    "expiresAt": new_session.expiresAt,
                })))
            }
        });

    let shared_me = shared.clone();
    let me_route = warp::path!("auth" / "me")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |claims: crate::auth::Claims| {
            let shared = shared_me.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let user = crate::database::get_user_by_id(&*conn_lock, &claims.sub)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e.to_string())))?
                    .ok_or_else(|| warp::reject::custom(AuthError::UserNotFound))?;

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "createdAt": user.createdAt,
                })))
            }
        });

    // Devices endpoints
    let shared_devices = shared.clone();
    let list_devices_route = warp::path("devices")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |_claims| {
            let shared = shared_devices.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let list = crate::database::query_devices(&*conn_lock)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e.to_string())))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&list))
            }
        });

    #[derive(serde::Deserialize)]
    struct PairDeviceRequest {
        token: String,
        deviceId: String,
        deviceName: String,
        platform: String,
    }

    let shared_pair = shared.clone();
    let pair_device_route = warp::path!("devices" / "pair")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(move |req: PairDeviceRequest| {
            let shared = shared_pair.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                crate::pairing::redeem_pairing_token(
                    &*conn_lock,
                    &req.token,
                    &req.deviceId,
                    &req.deviceName,
                    &req.platform,
                ).map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "pending_approval" })))
            }
        });

    let shared_pair_status = shared.clone();
    let pair_status_route = warp::path!("devices" / "pair" / "status")
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and_then(move |query: std::collections::HashMap<String, String>| {
            let shared = shared_pair_status.clone();
            async move {
                let Some(device_id) = query.get("deviceId") else {
                    return Err(warp::reject::custom(AuthError::MissingHeader));
                };
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                match crate::pairing::check_pairing_status(&*conn_lock, device_id) {
                    Ok(Some(session)) => {
                        Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                            "status": "approved",
                            "token": session.token,
                        })))
                    }
                    Ok(None) => {
                        Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                            "status": "pending",
                        })))
                    }
                    Err(e) => Err(warp::reject::custom(AuthError::InvalidToken(e))),
                }
            }
        });

    let shared_pairing_token = shared.clone();
    let pairing_token_route = warp::path!("devices" / "pairing-token")
        .and(warp::post())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |_claims| {
            let shared = shared_pairing_token.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let code = crate::pairing::generate_pairing_token(&*conn_lock)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "token": code })))
            }
        });

    #[derive(serde::Deserialize)]
    struct TrustDeviceRequest {
        trusted: bool,
    }

    let shared_trust_device = shared.clone();
    let trust_device_route = warp::path!("devices" / String / "trust")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |device_id: String, req: TrustDeviceRequest, _claims| {
            let shared = shared_trust_device.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                crate::devices::set_device_trust(&*conn_lock, &device_id, req.trusted)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    #[derive(serde::Deserialize)]
    struct RenameDeviceRequest {
        name: String,
    }

    let shared_rename_device = shared.clone();
    let rename_device_route = warp::path!("devices" / String / "rename")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |device_id: String, req: RenameDeviceRequest, _claims| {
            let shared = shared_rename_device.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                crate::devices::rename_device(&*conn_lock, &device_id, &req.name)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    let shared_delete_device = shared.clone();
    let remove_device_route = warp::path!("devices" / String)
        .and(warp::delete())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |device_id: String, _claims| {
            let shared = shared_delete_device.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                crate::devices::revoke_device(&*conn_lock, &device_id)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    // Remote access
    let shared_remote_runtime = shared.clone();
    let remote_runtime_route = warp::path!("remote" / "runtime")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |_claims| {
            let shared = shared_remote_runtime.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let info = crate::remote::get_remote_runtime_info(&*conn_lock)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&info))
            }
        });

    let shared_remote_sessions = shared.clone();
    let remote_sessions_route = warp::path!("remote" / "sessions")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Admin"))
        .and_then(move |_claims| {
            let shared = shared_remote_sessions.clone();
            async move {
                let conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn_lock = conn.lock().unwrap();
                let sessions = crate::remote::get_active_sessions(&*conn_lock)
                    .map_err(|e| warp::reject::custom(AuthError::InvalidToken(e)))?;
                Ok::<_, warp::Rejection>(warp::reply::json(&sessions))
            }
        });

    // Audio stream route
    let shared_audio_stream = shared.clone();
    let audio_stream_route = warp::path!("audio" / "stream" / String)
        .and(warp::get())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |media_id: String, query: std::collections::HashMap<String, String>, _claims| {
            let shared = shared_audio_stream.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                let media = match crate::database::get_media_by_id(&*conn, &media_id) {
                    Ok(Some(m)) => m,
                    _ => return Err(warp::reject::not_found()),
                };

                if !media.path.exists() {
                    return Err(warp::reject::not_found());
                }

                let transcode_requested = query.get("transcode").map(|v| v == "true").unwrap_or(false);
                let should_transcode = transcode_requested || crate::audio::should_transcode_audio(&media);

                use warp::Reply;

                if !should_transcode {
                    let encoded_path = percent_encode_path(&media.path.to_string_lossy());
                    let redirect_url = format!("/media-file/{}", encoded_path);
                    
                    #[derive(serde::Serialize)]
                    struct RedirectResponse {
                        url: String,
                        transcoded: bool,
                    }
                    
                    return Ok::<_, warp::Rejection>(warp::reply::with_status(
                        warp::reply::json(&RedirectResponse { url: redirect_url, transcoded: false }),
                        warp::http::StatusCode::OK
                    ).into_response());
                }

                let ffmpeg_bin = crate::transcoding::get_ffmpeg_path();
                let mut child = match tokio::process::Command::new(ffmpeg_bin)
                    .arg("-y")
                    .arg("-i")
                    .arg(&media.path)
                    .arg("-c:a")
                    .arg("libmp3lame")
                    .arg("-b:a")
                    .arg("192k")
                    .arg("-f")
                    .arg("mp3")
                    .arg("pipe:1")
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                {
                    Ok(c) => c,
                    Err(e) => {
                        log::error!("Failed to spawn FFmpeg for audio transcoding: {}", e);
                        return Err(warp::reject::not_found());
                    }
                };

                let mut stdout = child.stdout.take().ok_or_else(|| warp::reject::not_found())?;
                
                let stream = futures::stream::unfold(stdout, |mut stdout| async move {
                    let mut buf = vec![0u8; 8192];
                    match tokio::io::AsyncReadExt::read(&mut stdout, &mut buf).await {
                        Ok(0) => None,
                        Ok(n) => {
                            buf.truncate(n);
                            Some((Ok::<_, warp::Error>(warp::hyper::body::Bytes::from(buf)), stdout))
                        }
                        Err(_) => None,
                    }
                });

                let body = warp::hyper::Body::wrap_stream(stream);
                let response = warp::http::Response::builder()
                    .header("content-type", "audio/mpeg")
                    .body(body)
                    .map_err(|_| warp::reject::not_found())?;
                Ok::<_, warp::Rejection>(response)
            }
        });

    // Playlists CRUD endpoints
    let shared_audio_get_playlists = shared.clone();
    let audio_get_playlists_route = warp::path!("audio" / "playlists")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |_claims| {
            let shared = shared_audio_get_playlists.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                let playlists = crate::database::get_audio_playlists(&*conn).unwrap_or_default();
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "playlists": playlists, "total": playlists.len() })))
            }
        });

    #[derive(serde::Deserialize)]
    struct PlaylistCreateRequest {
        id: Option<String>,
        name: String,
        mediaIds: Vec<String>,
    }

    let shared_audio_post_playlists = shared.clone();
    let audio_post_playlists_route = warp::path!("audio" / "playlists")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: PlaylistCreateRequest, _claims| {
            let shared = shared_audio_post_playlists.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                let playlist = crate::audio::AudioPlaylist {
                    id: req.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    name: req.name,
                    media_ids: req.mediaIds,
                };
                crate::database::insert_audio_playlist(&*conn, &playlist)
                    .map_err(|_| warp::reject::reject())?;
                Ok::<_, warp::Rejection>(warp::reply::json(&playlist))
            }
        });

    let shared_audio_delete_playlist = shared.clone();
    let audio_delete_playlist_route = warp::path!("audio" / "playlists" / String)
        .and(warp::delete())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |id: String, _claims| {
            let shared = shared_audio_delete_playlist.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                crate::database::delete_audio_playlist(&*conn, &id)
                    .map_err(|_| warp::reject::reject())?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    // Queue endpoints
    let shared_audio_get_queue = shared.clone();
    let audio_get_queue_route = warp::path!("audio" / "queue")
        .and(warp::get())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |_claims| {
            let shared = shared_audio_get_queue.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                let queue = crate::database::get_audio_queue(&*conn)
                    .unwrap_or(None)
                    .unwrap_or_else(|| crate::audio::AudioQueue {
                        current_index: 0,
                        media_ids: Vec::new(),
                        shuffle: false,
                        repeat: "none".to_string(),
                    });
                Ok::<_, warp::Rejection>(warp::reply::json(&queue))
            }
        });

    #[derive(serde::Deserialize)]
    struct QueueSaveRequest {
        currentIndex: usize,
        mediaIds: Vec<String>,
        shuffle: bool,
        repeat: String,
    }

    let shared_audio_post_queue = shared.clone();
    let audio_post_queue_route = warp::path!("audio" / "queue")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: QueueSaveRequest, _claims| {
            let shared = shared_audio_post_queue.clone();
            async move {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                let queue = crate::audio::AudioQueue {
                    current_index: req.currentIndex,
                    media_ids: req.mediaIds,
                    shuffle: req.shuffle,
                    repeat: req.repeat,
                };
                crate::database::save_audio_queue(&*conn, &queue)
                    .map_err(|_| warp::reject::reject())?;
                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({ "status": "success" })))
            }
        });

    let shared_upload = shared.clone();
    let upload_route = warp::path!("media" / "upload")
        .and(warp::post())
        .and(warp::query::<UploadQuery>())
        .and(warp::multipart::form().max_length(5_000_000_000))
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |query: UploadQuery, form: warp::multipart::FormData, _claims| {
            let shared = shared_upload.clone();
            async move {
                handle_upload(shared, query, form).await
            }
        });

    let shared_create_dir = shared.clone();
    let create_directory_route = warp::path!("media" / "create-directory")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: CreateDirectoryRequest, _claims| {
            let shared = shared_create_dir.clone();
            async move {
                let (storage_root, media_folders) = {
                    let state = shared.lock().unwrap();
                    (state.storage_root.clone(), state.config.media_folders.clone())
                };

                let relative_category_folder = match req.category.as_str() {
                    "movies" => &media_folders.movies,
                    "music" => &media_folders.music,
                    "shows" => &media_folders.shows,
                    "photos" => &media_folders.photos,
                    "drive" => &media_folders.drive,
                    _ => return Err(warp::reject::reject()),
                };

                let category_root = storage_root.join(relative_category_folder);
                let decoded_path = percent_decode(&req.path);
                let target_dir = category_root.join(&decoded_path);

                if let Err(e) = std::fs::create_dir_all(&target_dir) {
                    log::error!("Failed to create directory {:?}: {}", target_dir, e);
                    return Err(warp::reject::reject());
                }

                let state = shared.lock().unwrap();
                if let Some(jm) = &state.job_manager {
                    jm.enqueue_scan();
                }

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "status": "success",
                    "path": req.path
                })))
            }
        });

    let shared_rename = shared.clone();
    let rename_route = warp::path!("media" / "rename")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: RenameRequest, _claims| {
            let shared = shared_rename.clone();
            async move {
                let (storage_root, media_folders) = {
                    let state = shared.lock().unwrap();
                    (state.storage_root.clone(), state.config.media_folders.clone())
                };

                let relative_category_folder = match req.category.as_str() {
                    "movies" => &media_folders.movies,
                    "music" => &media_folders.music,
                    "shows" => &media_folders.shows,
                    "photos" => &media_folders.photos,
                    "drive" => &media_folders.drive,
                    _ => return Err(warp::reject::reject()),
                };

                let category_root = storage_root.join(relative_category_folder);
                let decoded_old = percent_decode(&req.oldPath);
                let decoded_new = percent_decode(&req.newPath);

                let old_full = category_root.join(&decoded_old);
                let new_full = category_root.join(&decoded_new);

                if !old_full.exists() {
                    return Err(warp::reject::reject());
                }

                if let Err(e) = std::fs::rename(&old_full, &new_full) {
                    log::error!("Failed to rename {:?} to {:?}: {}", old_full, new_full, e);
                    return Err(warp::reject::reject());
                }

                let job_manager = {
                    let state = shared.lock().unwrap();
                    state.job_manager.clone()
                };

                if let Some(jm) = job_manager {
                    if old_full.is_file() {
                        let indexer = crate::indexing::IndexingService::new(shared.clone());
                        let _ = indexer.rename_path(old_full, new_full, req.category).await;
                    } else {
                        jm.enqueue_scan();
                    }
                }

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "status": "success"
                })))
            }
        });

    let shared_delete = shared.clone();
    let delete_route = warp::path!("media" / "delete")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_auth(shared.clone(), "Viewer"))
        .and_then(move |req: DeleteRequest, _claims| {
            let shared = shared_delete.clone();
            async move {
                let (storage_root, media_folders) = {
                    let state = shared.lock().unwrap();
                    (state.storage_root.clone(), state.config.media_folders.clone())
                };

                let relative_category_folder = match req.category.as_str() {
                    "movies" => &media_folders.movies,
                    "music" => &media_folders.music,
                    "shows" => &media_folders.shows,
                    "photos" => &media_folders.photos,
                    "drive" => &media_folders.drive,
                    _ => return Err(warp::reject::reject()),
                };

                let category_root = storage_root.join(relative_category_folder);
                let decoded_path = percent_decode(&req.path);
                let full_path = category_root.join(&decoded_path);

                if !full_path.exists() {
                    return Err(warp::reject::reject());
                }

                if full_path.is_file() {
                    let db_conn = {
                        let state = shared.lock().unwrap();
                        state.db_conn.clone()
                    };
                    let conn = db_conn.lock().unwrap();
                    let item_opt = database::get_media_by_path(&*conn, &full_path).unwrap_or(None);
                    drop(conn);

                    if let Err(e) = std::fs::remove_file(&full_path) {
                        log::error!("Failed to remove file {:?}: {}", full_path, e);
                        return Err(warp::reject::reject());
                    }

                    if let Some(item) = item_opt {
                        {
                            let conn = db_conn.lock().unwrap();
                            let _ = database::remove_media_by_id(&*conn, &item.id);
                            let _ = database::remove_thumbnail_record(&*conn, &item.id);
                        }

                        crate::sync::emit(
                            &shared,
                            "MEDIA_REMOVED",
                            serde_json::json!({
                                "mediaId": item.id,
                                "path": item.path.to_string_lossy().to_string(),
                                "category": item.category,
                            }),
                        );
                    }
                } else {
                    if let Err(e) = std::fs::remove_dir_all(&full_path) {
                        log::error!("Failed to remove directory {:?}: {}", full_path, e);
                        return Err(warp::reject::reject());
                    }

                    let job_manager = {
                        let state = shared.lock().unwrap();
                        state.job_manager.clone()
                    };
                    if let Some(jm) = job_manager {
                        jm.enqueue_scan();
                    }
                }

                Ok::<_, warp::Rejection>(warp::reply::json(&serde_json::json!({
                    "status": "success"
                })))
            }
        });

    let ws_route = get_websocket_route(shared.clone(), tx, app_handle.clone());

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["GET", "POST", "DELETE", "OPTIONS"])
        .allow_headers(vec!["content-type", "authorization"]);

    rest.or(health_route)
        .or(runtime_route)
        .or(categories_route)
        .or(media_route)
        .or(media_details_route)
        .or(thumbnail_route)
        .or(media_file_route)
        .or(scan_route)
        .or(jobs_route)
        .or(stats_route)
        .or(setup_drives_route)
        .or(setup_route)
        .or(stream_start_route)
        .or(hls_serve_route)
        .or(subtitles_route)
        .or(watch_progress_route)
        .or(watch_continue_route)
        .or(login_route)
        .or(logout_route)
        .or(refresh_route)
        .or(me_route)
        .or(list_devices_route)
        .or(pair_device_route)
        .or(pair_status_route)
        .or(pairing_token_route)
        .or(trust_device_route)
        .or(rename_device_route)
        .or(remove_device_route)
        .or(remote_runtime_route)
        .or(remote_sessions_route)
        .or(audio_stream_route)
        .or(audio_get_playlists_route)
        .or(audio_post_playlists_route)
        .or(audio_delete_playlist_route)
        .or(audio_get_queue_route)
        .or(audio_post_queue_route)
        .or(upload_route)
        .or(create_directory_route)
        .or(rename_route)
        .or(delete_route)
        .or(ws_route)
        .recover(handle_rejection)
        .with(cors)
}

pub fn get_websocket_route(
    shared: SharedRuntimeState,
    tx: Sender<String>,
    app_handle: Option<tauri::AppHandle>,
) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let shared_ws = shared.clone();
    let app_handle_ws = app_handle.clone();

    warp::path("ws")
        .and(warp::ws())
        .and(warp::any().map(move || tx.clone()))
        .and(warp::addr::remote())
        .and(warp::query::<std::collections::HashMap<String, String>>())
        .and(warp::any().map(move || shared_ws.clone()))
        .and(warp::any().map(move || app_handle_ws.clone()))
        .and_then(|ws: warp::ws::Ws, tx, addr, query: std::collections::HashMap<String, String>, shared_state: SharedRuntimeState, handle| async move {
            let token = query.get("token").cloned()
                .or_else(|| query.get("sessionId").cloned());
            
            let (conn, is_configured) = {
                let state = shared_state.lock().unwrap();
                (state.db_conn.clone(), state.is_configured)
            };

            if is_configured {
                let conn_lock = conn.lock().unwrap();
                // If there are actually users in the system, enforce auth
                let has_users = crate::database::count_users(&*conn_lock).unwrap_or(0) > 0;

                if has_users {
                    let Some(tok) = token else {
                        return Err(warp::reject::custom(AuthError::MissingHeader));
                    };

                    if let Err(e) = crate::sessions::validate_user_session(&*conn_lock, &tok) {
                        return Err(warp::reject::custom(AuthError::InvalidToken(e)));
                    }
                }
            }

            Ok::<_, warp::Rejection>((ws, tx, addr, shared_state, handle))
        })
        .map(|(ws, tx, addr, shared_state, handle): (warp::ws::Ws, Sender<String>, Option<SocketAddr>, SharedRuntimeState, Option<tauri::AppHandle>)| {
            ws.on_upgrade(move |socket| {
                crate::server::client_connection(socket, tx, addr, shared_state, handle)
            })
        })
}

#[derive(Serialize)]
struct ErrorMessage {
    code: u16,
    message: String,
}

async fn handle_rejection(
    err: warp::Rejection,
) -> Result<impl warp::Reply, std::convert::Infallible> {
    // Auth-related rejections are expected during normal operation (unauthenticated
    // page loads, expired sessions, etc.). Log them at WARN to avoid noise.
    if err.find::<AuthError>().is_some() {
        log::warn!("API auth rejection: {:?}", err);
    } else if !err.is_not_found() {
        log::error!("API rejection: {:?}", err);
    }

    let code;
    let message;

    if err.is_not_found() {
        code = warp::http::StatusCode::NOT_FOUND;
        message = "Resource not found".to_string();
    } else if let Some(_) = err.find::<warp::reject::MethodNotAllowed>() {
        code = warp::http::StatusCode::METHOD_NOT_ALLOWED;
        message = "Method not allowed".to_string();
    } else if let Some(e) = err.find::<warp::filters::body::BodyDeserializeError>() {
        code = warp::http::StatusCode::BAD_REQUEST;
        message = e.to_string();
    } else if let Some(auth_err) = err.find::<AuthError>() {
        match auth_err {
            AuthError::MissingHeader => {
                code = warp::http::StatusCode::UNAUTHORIZED;
                message = "Missing authorization header".to_string();
            }
            AuthError::InvalidHeader => {
                code = warp::http::StatusCode::UNAUTHORIZED;
                message = "Invalid authorization header format".to_string();
            }
            AuthError::InvalidToken(reason) => {
                code = warp::http::StatusCode::UNAUTHORIZED;
                message = format!("Unauthorized: {}", reason);
            }
            AuthError::UserNotFound => {
                code = warp::http::StatusCode::UNAUTHORIZED;
                message = "User not found".to_string();
            }
            AuthError::Unauthorized => {
                code = warp::http::StatusCode::FORBIDDEN;
                message = "Forbidden: insufficient permissions".to_string();
            }
            AuthError::RateLimited(secs) => {
                code = warp::http::StatusCode::TOO_MANY_REQUESTS;
                message = format!("Too many login attempts. Retry in {} seconds.", secs);
            }
        }
    } else {
        code = warp::http::StatusCode::INTERNAL_SERVER_ERROR;
        message = "Internal server error".to_string();
    }

    let json = warp::reply::json(&ErrorMessage {
        code: code.as_u16(),
        message,
    });

    Ok(warp::reply::with_status(json, code))
}

fn percent_decode(s: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = s.as_bytes().iter();
    while let Some(&b) = chars.next() {
        if b == b'%' {
            if let (Some(&h), Some(&l)) = (chars.next(), chars.next()) {
                if let Some(decoded) = hex_to_byte(h, l) {
                    bytes.push(decoded);
                    continue;
                }
            }
        }
        bytes.push(b);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn hex_to_byte(h: u8, l: u8) -> Option<u8> {
    let h_val = (h as char).to_digit(16)?;
    let l_val = (l as char).to_digit(16)?;
    Some((h_val * 16 + l_val) as u8)
}

fn percent_encode_path(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' | b'\\' => {
                encoded.push(*b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use crate::runtime::RuntimeState;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_runtime_health_configuration_logic() {
        let state_unconfigured = RuntimeState {
            storage_root: std::path::PathBuf::from("C:/MediaGrid"),
            config: crate::config::RuntimeConfig::defaults(),
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
            db_conn: Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap())),
            event_tx: None,
            job_manager: None,
            background_workers_started: false,
            is_configured: false,
            active_transcodes: std::collections::HashMap::new(),
        };
        assert!(!state_unconfigured.is_configured);

        let state_configured = RuntimeState {
            storage_root: std::path::PathBuf::from("C:/MediaGrid"),
            config: crate::config::RuntimeConfig::defaults(),
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
            db_conn: Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap())),
            event_tx: None,
            job_manager: None,
            background_workers_started: false,
            is_configured: true,
            active_transcodes: std::collections::HashMap::new(),
        };
        assert!(state_configured.is_configured);
    }
}
