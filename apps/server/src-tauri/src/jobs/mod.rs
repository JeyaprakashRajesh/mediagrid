use std::{path::PathBuf, sync::Arc, time::Duration};

use tokio::sync::mpsc;

use crate::{
    cache,
    database::{self, JobRecord},
    indexing::IndexingService,
    metadata,
    runtime::SharedRuntimeState,
    thumbnails,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of execution attempts before a job is moved to the dead-letter
/// state ("dead"). Exponential backoff is applied between each attempt.
const MAX_ATTEMPTS: i64 = 3;

/// Maximum backoff delay between retries (seconds).
const MAX_BACKOFF_SECS: u64 = 300;

/// How often the scheduler fires an automatic cleanup job (seconds).
const CLEANUP_INTERVAL_SECS: u64 = 24 * 60 * 60; // 24 hours

/// Files in `cache/temp/` older than this many seconds are purged on each
/// cleanup pass.
const TEMP_MAX_AGE_SECS: u64 = 3600; // 1 hour

// ── Job types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub enum JobPriority {
    Indexing = 0,
    Metadata = 1,
    Thumbnails = 2,
    Cleanup = 3,
}

#[derive(Debug, Clone)]
pub enum JobRequest {
    ScanAll,
    IndexMedia {
        path: PathBuf,
        category: String,
    },
    RenameMedia {
        old_path: PathBuf,
        new_path: PathBuf,
        category: String,
    },
    RefreshMetadata {
        media_id: String,
    },
    GenerateThumbnail {
        media_id: String,
    },
    RemoveMedia {
        path: PathBuf,
    },
    Cleanup,
}

// ── Handle ────────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct JobManagerHandle {
    high_tx: mpsc::UnboundedSender<JobRequest>,
    normal_tx: mpsc::UnboundedSender<JobRequest>,
    low_tx: mpsc::UnboundedSender<JobRequest>,
    shared: SharedRuntimeState,
}

impl JobManagerHandle {
    pub fn enqueue_scan(&self) {
        self.enqueue(JobRequest::ScanAll, JobPriority::Indexing);
    }

    pub fn enqueue_index_media(&self, path: PathBuf, category: String) {
        self.enqueue(
            JobRequest::IndexMedia { path, category },
            JobPriority::Indexing,
        );
    }

    pub fn enqueue_rename_media(&self, old_path: PathBuf, new_path: PathBuf, category: String) {
        self.enqueue(
            JobRequest::RenameMedia {
                old_path,
                new_path,
                category,
            },
            JobPriority::Indexing,
        );
    }

    pub fn enqueue_refresh_metadata(&self, media_id: String) {
        self.enqueue(
            JobRequest::RefreshMetadata { media_id },
            JobPriority::Metadata,
        );
    }

    pub fn enqueue_thumbnail(&self, media_id: String) {
        self.enqueue(
            JobRequest::GenerateThumbnail { media_id },
            JobPriority::Thumbnails,
        );
    }

    pub fn enqueue_remove_media(&self, path: PathBuf) {
        self.enqueue(JobRequest::RemoveMedia { path }, JobPriority::Cleanup);
    }

    pub fn enqueue_cleanup(&self) {
        self.enqueue(JobRequest::Cleanup, JobPriority::Cleanup);
    }

    fn enqueue(&self, request: JobRequest, priority: JobPriority) {
        let record = build_job_record(&request, priority);
        persist_job(&self.shared, &record);

        let _ = match priority {
            JobPriority::Indexing => self.high_tx.send(request),
            JobPriority::Metadata => self.normal_tx.send(request),
            JobPriority::Thumbnails | JobPriority::Cleanup => self.low_tx.send(request),
        };
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────

pub fn start_job_manager(
    shared: SharedRuntimeState,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> Arc<JobManagerHandle> {
    let (high_tx, high_rx) = mpsc::unbounded_channel::<JobRequest>();
    let (normal_tx, normal_rx) = mpsc::unbounded_channel::<JobRequest>();
    let (low_tx, low_rx) = mpsc::unbounded_channel::<JobRequest>();

    let handle = Arc::new(JobManagerHandle {
        high_tx,
        normal_tx,
        low_tx,
        shared: shared.clone(),
    });

    let worker_handle = handle.clone();
    spawn_background(async move {
        worker_loop(
            worker_handle,
            shared,
            high_rx,
            normal_rx,
            low_rx,
            shutdown_rx,
        )
        .await;
    });

    handle
}

/// Starts a background Tokio task that enqueues a `Cleanup` job every
/// `CLEANUP_INTERVAL_SECS`. The task respects the shutdown signal.
pub fn start_cleanup_scheduler(
    job_manager: Arc<JobManagerHandle>,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    spawn_background(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
        // Skip the immediate first tick so the cleanup doesn't fire at startup
        interval.tick().await;

        loop {
            tokio::select! {
              _ = interval.tick() => {
                log::info!("Cleanup scheduler: enqueueing periodic cleanup job");
                job_manager.enqueue_cleanup();
              }
              _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                  break;
                }
              }
            }
        }
    });
}

// ── Worker loop ───────────────────────────────────────────────────────────────

fn spawn_background<F>(future: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        handle.spawn(future);
    } else {
        tauri::async_runtime::spawn(future);
    }
}

async fn worker_loop(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    mut high_rx: mpsc::UnboundedReceiver<JobRequest>,
    mut normal_rx: mpsc::UnboundedReceiver<JobRequest>,
    mut low_rx: mpsc::UnboundedReceiver<JobRequest>,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    loop {
        if *shutdown_rx.borrow() {
            break;
        }

        let request = tokio::select! {
          biased;
          value = high_rx.recv() => value,
          value = normal_rx.recv() => value,
          value = low_rx.recv() => value,
          changed = shutdown_rx.changed() => {
            if changed.is_ok() && *shutdown_rx.borrow() {
              break;
            }
            continue;
          }
        };

        let Some(request) = request else {
            tokio::time::sleep(Duration::from_millis(50)).await;
            continue;
        };

        if let Err(error) = process_job_with_retry(manager.clone(), shared.clone(), request).await {
            log::error!("Job permanently failed: {error}");
        }
    }
}

// ── Retry logic ───────────────────────────────────────────────────────────────

/// Run `request`, retrying with exponential backoff on failure.
/// After `MAX_ATTEMPTS` the job is marked `"dead"` and a `JOB_DEAD` event is
/// emitted instead of re-queuing.
async fn process_job_with_retry(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    request: JobRequest,
) -> Result<(), String> {
    let job_id = job_id(&request);

    // Read how many attempts have already been made (from previous worker runs
    // if the process was restarted, or from the current session).
    let prior_attempts = {
        let db_conn = {
            let state = shared.lock().unwrap();
            state.db_conn.clone()
        };
        let conn = db_conn.lock().unwrap();
        database::get_job_attempts(&*conn, &job_id).unwrap_or(0)
    };

    if prior_attempts >= MAX_ATTEMPTS {
        // Already exhausted — mark dead and bail out
        mark_job_dead(
            &shared,
            &job_id,
            "max retry attempts already reached on load".to_string(),
        );
        return Err(format!("Job {job_id} is already at max attempts"));
    }

    // Apply backoff before this attempt if this is a retry
    if prior_attempts > 0 {
        let backoff_secs = 2u64.pow(prior_attempts as u32).min(MAX_BACKOFF_SECS);
        log::info!("Job {job_id}: retry attempt {prior_attempts}, backing off {backoff_secs}s");
        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
    }

    // Run the job
    match process_job(manager.clone(), shared.clone(), request.clone()).await {
        Ok(()) => Ok(()),
        Err(error) => {
            // Increment the attempt counter in the DB and decide what to do
            let new_attempts = {
                let db_conn = {
                    let state = shared.lock().unwrap();
                    state.db_conn.clone()
                };
                let conn = db_conn.lock().unwrap();
                database::increment_job_attempts(&*conn, &job_id).unwrap_or(MAX_ATTEMPTS)
            };

            log::warn!("Job {job_id} failed (attempt {new_attempts}/{MAX_ATTEMPTS}): {error}");

            if new_attempts >= MAX_ATTEMPTS {
                mark_job_dead(&shared, &job_id, error.clone());
                Err(error)
            } else {
                // Re-queue through the appropriate priority channel
                let priority = priority_for(&request);
                let _ = match priority {
                    JobPriority::Indexing => manager.high_tx.send(request),
                    JobPriority::Metadata => manager.normal_tx.send(request),
                    JobPriority::Thumbnails | JobPriority::Cleanup => manager.low_tx.send(request),
                };
                Ok(()) // We've re-queued, so the worker loop can continue
            }
        }
    }
}

/// Mark a job as permanently dead and notify via WebSocket.
fn mark_job_dead(shared: &SharedRuntimeState, job_id: &str, error: String) {
    log::error!("Job {job_id} exhausted all retries → moving to dead-letter: {error}");
    update_job_status(
        shared,
        job_id,
        "dead",
        Some(error.clone()),
        Some(chrono::Utc::now().to_rfc3339()),
    );
    crate::sync::emit(
        shared,
        "JOB_DEAD",
        serde_json::json!({
          "jobId": job_id,
          "error": error,
        }),
    );
}

fn priority_for(request: &JobRequest) -> JobPriority {
    match request {
        JobRequest::ScanAll | JobRequest::IndexMedia { .. } | JobRequest::RenameMedia { .. } => {
            JobPriority::Indexing
        }
        JobRequest::RefreshMetadata { .. } => JobPriority::Metadata,
        JobRequest::GenerateThumbnail { .. }
        | JobRequest::RemoveMedia { .. }
        | JobRequest::Cleanup => JobPriority::Cleanup,
    }
}

// ── Job execution ─────────────────────────────────────────────────────────────

async fn process_job(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    request: JobRequest,
) -> Result<(), String> {
    let job_id = job_id(&request);
    update_job_status(&shared, &job_id, "running", None, None);
    update_active_jobs(&shared, 1);

    let result = match request.clone() {
        JobRequest::ScanAll => scan_all(manager, shared.clone(), job_id.clone()).await,
        JobRequest::IndexMedia { path, category } => {
            index_media(manager, shared.clone(), job_id.clone(), path, category).await
        }
        JobRequest::RenameMedia {
            old_path,
            new_path,
            category,
        } => rename_media(shared.clone(), job_id.clone(), old_path, new_path, category).await,
        JobRequest::RefreshMetadata { media_id } => {
            refresh_metadata(manager, shared.clone(), job_id.clone(), media_id).await
        }
        JobRequest::GenerateThumbnail { media_id } => {
            generate_thumbnail(shared.clone(), job_id.clone(), media_id).await
        }
        JobRequest::RemoveMedia { path } => {
            remove_media(shared.clone(), job_id.clone(), path).await
        }
        JobRequest::Cleanup => cleanup(shared.clone(), job_id.clone()).await,
    };

    update_active_jobs(&shared, -1);

    match result {
        Ok(()) => {
            update_job_status(
                &shared,
                &job_id,
                "completed",
                None,
                Some(chrono::Utc::now().to_rfc3339()),
            );
            Ok(())
        }
        Err(error) => {
            update_job_status(
                &shared,
                &job_id,
                "failed",
                Some(error.clone()),
                Some(chrono::Utc::now().to_rfc3339()),
            );
            Err(error)
        }
    }
}

// ── Individual job handlers ───────────────────────────────────────────────────

async fn scan_all(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    job_id: String,
) -> Result<(), String> {
    IndexingService::new(shared.clone())
        .scan_and_sync(manager, job_id)
        .await
}

async fn index_media(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    job_id: String,
    path: PathBuf,
    category: String,
) -> Result<(), String> {
    let item = IndexingService::new(shared.clone())
        .index_path(path, category)
        .await?;
    manager.enqueue_thumbnail(item.id.clone());
    update_indexed_count(&shared);
    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "index"}),
    );
    Ok(())
}

async fn rename_media(
    shared: SharedRuntimeState,
    job_id: String,
    old_path: PathBuf,
    new_path: PathBuf,
    category: String,
) -> Result<(), String> {
    IndexingService::new(shared.clone())
        .rename_path(old_path, new_path, category)
        .await?;
    update_indexed_count(&shared);
    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "rename"}),
    );
    Ok(())
}

async fn refresh_metadata(
    manager: Arc<JobManagerHandle>,
    shared: SharedRuntimeState,
    job_id: String,
    media_id: String,
) -> Result<(), String> {
    let item = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::get_media_by_id(&*conn, &media_id).map_err(|error| error.to_string())?
    };

    let Some(mut item) = item else {
        return Err(format!("Unknown media id: {media_id}"));
    };

    let storage_root = {
        let state = shared.lock().unwrap();
        state.storage_root.clone()
    };

    let media_id_clone = media_id.clone();
    let extracted = tokio::task::spawn_blocking({
        let path = item.path.clone();
        let category = item.category.clone();
        move || {
            metadata::extract_with_cache(
                &path,
                &category,
                Some(&storage_root),
                Some(&media_id_clone),
            )
        }
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    if let Some(ref title) = extracted.title {
        if !title.is_empty() {
            item.title = title.clone();
        }
    }

    item.artist = extracted.artist;
    item.album = extracted.album;
    item.mime_type = extracted.mime_type;
    item.size_bytes = extracted.size_bytes;
    item.duration = extracted.duration;
    item.resolution = extracted.resolution;
    item.codec = extracted.codec;
    item.bitrate = extracted.bitrate;
    item.fps = extracted.fps;
    item.sample_rate = extracted.sample_rate;
    item.format = extracted.format;
    item.hash = extracted.hash;
    item.updated_at = chrono::Utc::now().to_rfc3339();
    item.indexed_at = chrono::Utc::now().to_rfc3339();

    {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::upsert_media_item(&*conn, &item).map_err(|error| error.to_string())?;
    }

    crate::sync::emit(
        &shared,
        "METADATA_UPDATED",
        serde_json::json!({"id": media_id, "path": item.path.to_string_lossy().to_string()}),
    );
    manager.enqueue_thumbnail(item.id.clone());
    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "metadata"}),
    );
    Ok(())
}

async fn generate_thumbnail(
    shared: SharedRuntimeState,
    job_id: String,
    media_id: String,
) -> Result<(), String> {
    let item = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::get_media_by_id(&*conn, &media_id).map_err(|error| error.to_string())?
    };

    let Some(mut item) = item else {
        return Err(format!("Unknown media id: {media_id}"));
    };

    let root = {
        let state = shared.lock().unwrap();
        state.storage_root.clone()
    };

    let thumbnail_path = tokio::task::spawn_blocking({
        let root = root.clone();
        let item = item.clone();
        move || thumbnails::generate_thumbnail(&root, &item)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    if let Some(path) = thumbnail_path {
        item.thumbnail_path = Some(path.clone());
        {
            let state = shared.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            database::upsert_media_item(&*conn, &item).map_err(|error| error.to_string())?;
            database::touch_thumbnail_record(&*conn, &item.id, &path)
                .map_err(|error| error.to_string())?;
        }
        crate::sync::emit(
            &shared,
            "THUMBNAIL_GENERATED",
            serde_json::json!({"id": media_id, "path": path}),
        );
    }

    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "thumbnail"}),
    );
    Ok(())
}

async fn remove_media(
    shared: SharedRuntimeState,
    job_id: String,
    path: PathBuf,
) -> Result<(), String> {
    let removed = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::remove_media_by_path(&*conn, &path).map_err(|error| error.to_string())?
    };

    if let Some(media) = removed {
        let root = {
            let state = shared.lock().unwrap();
            state.storage_root.clone()
        };

        {
            let state = shared.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            let _ = database::remove_thumbnail_record(&*conn, &media.id);
        }

        // Eagerly delete the thumbnail file so it does not become an orphan
        thumbnails::delete_thumbnail(&root, &media.id);

        // Also remove cached metadata entry
        let meta_cache_path = cache::metadata_dir(&root).join(format!("{}.json", media.id));
        let _ = std::fs::remove_file(meta_cache_path);

        crate::sync::emit(
            &shared,
            "MEDIA_REMOVED",
            serde_json::json!({
              "id": media.id,
              "path": path.to_string_lossy().to_string(),
              "category": media.category,
            }),
        );
        emit_category_updated(&shared, &media.category);
    }

    update_indexed_count(&shared);
    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "remove"}),
    );
    Ok(())
}

// ── Cleanup job ───────────────────────────────────────────────────────────────

async fn cleanup(shared: SharedRuntimeState, job_id: String) -> Result<(), String> {
    let root = {
        let state = shared.lock().unwrap();
        state.storage_root.clone()
    };

    let known_ids = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::list_all_media_ids(&*conn).unwrap_or_default()
    };

    let mut deleted_thumbnails = 0usize;
    let mut deleted_metadata = 0usize;
    let mut deleted_temp = 0usize;

    // ── Orphaned thumbnail files ──────────────────────────────────────────────
    for thumbnail_id in thumbnails::list_thumbnail_ids(&root) {
        if !known_ids.contains(&thumbnail_id) {
            thumbnails::delete_thumbnail(&root, &thumbnail_id);
            deleted_thumbnails += 1;
            log::debug!("Cleanup: removed orphaned thumbnail for id={thumbnail_id}");
        }
    }

    // ── Stale metadata cache files ────────────────────────────────────────────
    for cached_id in cache::list_cached_metadata_ids(&root) {
        if !known_ids.contains(&cached_id) {
            let stale_path = cache::metadata_dir(&root).join(format!("{cached_id}.json"));
            let _ = std::fs::remove_file(&stale_path);
            deleted_metadata += 1;
            log::debug!("Cleanup: removed stale metadata cache for id={cached_id}");
        }
    }

    // ── Temp directory (files older than TEMP_MAX_AGE_SECS) ──────────────────
    let temp_dir = cache::temp_dir(&root);
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        let now = std::time::SystemTime::now();
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(meta) = std::fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    let age = now.duration_since(modified).unwrap_or_default();
                    if age.as_secs() >= TEMP_MAX_AGE_SECS {
                        let _ = std::fs::remove_file(&path);
                        deleted_temp += 1;
                        log::debug!(
                            "Cleanup: removed temp file {:?} (age={}s)",
                            path,
                            age.as_secs()
                        );
                    }
                }
            }
        }
    }

    log::info!(
        "Cleanup complete: {} orphan thumbnails, {} stale metadata entries, {} temp files removed",
        deleted_thumbnails,
        deleted_metadata,
        deleted_temp
    );

    update_indexed_count(&shared);

    crate::sync::emit(
        &shared,
        "CLEANUP_COMPLETED",
        serde_json::json!({
          "jobId": job_id,
          "deletedThumbnails": deleted_thumbnails,
          "deletedMetadata": deleted_metadata,
          "deletedTemp": deleted_temp,
        }),
    );

    crate::sync::emit(
        &shared,
        "JOB_COMPLETED",
        serde_json::json!({"jobId": job_id, "jobType": "cleanup"}),
    );
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn update_indexed_count(shared: &SharedRuntimeState) {
    let count = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::count_media(&*conn).unwrap_or(0)
    };
    let mut state = shared.lock().unwrap();
    state.indexed_media_count = count;
}

fn emit_category_updated(shared: &SharedRuntimeState, category: &str) {
    let item_count = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::query_category_counts(&*conn)
            .map(|counts| counts.get(category).copied().unwrap_or(0))
            .unwrap_or(0)
    };

    let category_name = match category {
        "movies" => "Movies",
        "music" => "Music",
        "photos" => "Photos",
        "drive" => "Drive",
        _ => category,
    };

    let last_scanned_at = {
        let state = shared.lock().unwrap();
        state.last_scan_at.clone()
    };

    crate::sync::emit(
        shared,
        "CATEGORY_UPDATED",
        serde_json::json!({
          "id": category,
          "name": category_name,
          "folder": format!("media/{category}"),
          "itemCount": item_count,
          "lastScannedAt": last_scanned_at,
        }),
    );
}

fn build_job_record(request: &JobRequest, priority: JobPriority) -> JobRecord {
    let job_type = match request {
        JobRequest::ScanAll => "scan",
        JobRequest::IndexMedia { .. } => "index",
        JobRequest::RenameMedia { .. } => "rename",
        JobRequest::RefreshMetadata { .. } => "metadata",
        JobRequest::GenerateThumbnail { .. } => "thumbnail",
        JobRequest::RemoveMedia { .. } => "remove",
        JobRequest::Cleanup => "cleanup",
    }
    .to_string();

    JobRecord {
        id: job_id(request),
        job_type,
        status: "queued".to_string(),
        payload: serde_json::to_string(&job_payload(request)).unwrap_or_else(|_| "{}".to_string()),
        priority: priority as i64,
        attempts: 0,
        error_message: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
    }
}

fn job_id(request: &JobRequest) -> String {
    match request {
        JobRequest::ScanAll => uuid::Uuid::new_v4().to_string(),
        JobRequest::IndexMedia { path, .. } => uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            path.to_string_lossy().as_bytes(),
        )
        .to_string(),
        JobRequest::RenameMedia {
            old_path, new_path, ..
        } => uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            format!(
                "{}->{}",
                old_path.to_string_lossy(),
                new_path.to_string_lossy()
            )
            .as_bytes(),
        )
        .to_string(),
        JobRequest::RefreshMetadata { media_id } => media_id.clone(),
        JobRequest::GenerateThumbnail { media_id } => media_id.clone(),
        JobRequest::RemoveMedia { path } => uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            path.to_string_lossy().as_bytes(),
        )
        .to_string(),
        JobRequest::Cleanup => uuid::Uuid::new_v4().to_string(),
    }
}

fn job_payload(request: &JobRequest) -> serde_json::Value {
    match request {
        JobRequest::ScanAll => serde_json::json!({"type": "scan"}),
        JobRequest::IndexMedia { path, category } => {
            serde_json::json!({"type": "index", "path": path.to_string_lossy().to_string(), "category": category})
        }
        JobRequest::RenameMedia {
            old_path,
            new_path,
            category,
        } => {
            serde_json::json!({"type": "rename", "oldPath": old_path.to_string_lossy().to_string(), "newPath": new_path.to_string_lossy().to_string(), "category": category})
        }
        JobRequest::RefreshMetadata { media_id } => {
            serde_json::json!({"type": "metadata", "mediaId": media_id})
        }
        JobRequest::GenerateThumbnail { media_id } => {
            serde_json::json!({"type": "thumbnail", "mediaId": media_id})
        }
        JobRequest::RemoveMedia { path } => {
            serde_json::json!({"type": "remove", "path": path.to_string_lossy().to_string()})
        }
        JobRequest::Cleanup => serde_json::json!({"type": "cleanup"}),
    }
}

fn persist_job(shared: &SharedRuntimeState, job: &JobRecord) {
    let db_conn = {
        let state = shared.lock().unwrap();
        state.db_conn.clone()
    };
    if let Ok(conn) = db_conn.lock() {
        let _ = database::insert_job(&*conn, job);
    };
}

fn update_job_status(
    shared: &SharedRuntimeState,
    id: &str,
    status: &str,
    error_message: Option<String>,
    completed_at: Option<String>,
) {
    let db_conn = {
        let state = shared.lock().unwrap();
        state.db_conn.clone()
    };
    if let Ok(conn) = db_conn.lock() {
        let _ = database::update_job_status(&*conn, id, status, error_message, completed_at);
    };
}

fn update_active_jobs(shared: &SharedRuntimeState, delta: isize) {
    let mut state = shared.lock().unwrap();
    if delta > 0 {
        state.active_jobs = state.active_jobs.saturating_add(delta as usize);
    } else {
        state.active_jobs = state.active_jobs.saturating_sub(delta.unsigned_abs());
    }
}
