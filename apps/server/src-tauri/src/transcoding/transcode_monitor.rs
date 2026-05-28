use std::time::SystemTime;
use crate::runtime::SharedRuntimeState;
use tokio::sync::watch::Receiver;
use tokio::time::{sleep, Duration};

/// Starts the transcode monitor and session cleanup background loop.
pub fn start_transcode_monitor(
    shared: SharedRuntimeState,
    mut shutdown_rx: Receiver<bool>,
) {
    tokio::spawn(async move {
        log::info!("MediaGrid Transcode Monitor active.");
        loop {
            tokio::select! {
                _ = sleep(Duration::from_secs(3)) => {
                    // 1. Check exited transcode processes
                    let mut finished_jobs = Vec::new();
                    {
                        let mut state = match shared.lock() {
                            Ok(guard) => guard,
                            Err(_) => continue,
                        };

                        let mut keys_to_remove = Vec::new();
                        for (key, child) in state.active_transcodes.iter_mut() {
                            match child.try_wait() {
                                Ok(Some(status)) => {
                                    keys_to_remove.push(key.clone());
                                    finished_jobs.push((key.clone(), status.success()));
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    log::error!("Error waiting on transcode process {}: {}", key, e);
                                    keys_to_remove.push(key.clone());
                                    finished_jobs.push((key.clone(), false));
                                }
                            }
                        }

                        for k in keys_to_remove {
                            state.active_transcodes.remove(&k);
                        }
                    }

                    // 2. Handle database updates and events for finished processes
                    if !finished_jobs.is_empty() {
                        let db_conn = {
                            let state = shared.lock().unwrap();
                            state.db_conn.clone()
                        };
                        let conn = db_conn.lock().unwrap();

                        for (key, success) in finished_jobs {
                            let parts: Vec<&str> = key.split('_').collect();
                            if parts.is_empty() {
                                continue;
                            }
                            let session_id = parts[0];
                            let quality = parts.get(1).copied().unwrap_or("unknown");

                            if let Ok(Some(session)) = crate::database::get_playback_session(&*conn, session_id) {
                                if let Ok(jobs) = crate::database::query_transcoding_jobs(&*conn) {
                                    // Find latest job for this media item that is in progress/pending
                                    if let Some(job) = jobs.into_iter().find(|j| j.mediaId == session.mediaId && (j.status == "processing" || j.status == "pending")) {
                                        let final_status = if success { "completed" } else { "failed" };
                                        let _ = crate::database::update_transcoding_job_status(&*conn, &job.id, final_status);

                                        if success {
                                            log::info!("Transcode job {} finished successfully for media {}", job.id, session.mediaId);
                                            crate::sync::emit(&shared, "TRANSCODE_COMPLETED", serde_json::json!({
                                                "sessionId": session_id,
                                                "mediaId": session.mediaId,
                                                "quality": quality,
                                                "jobId": job.id,
                                            }));
                                        } else {
                                            log::error!("Transcode job {} failed for media {}", job.id, session.mediaId);
                                            crate::sync::emit(&shared, "PLAYBACK_ERROR", serde_json::json!({
                                                "sessionId": session_id,
                                                "mediaId": session.mediaId,
                                                "error": "Transcoding process failed",
                                                "jobId": job.id,
                                            }));
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 3. Clean up inactive/expired streaming sessions
                    check_and_cleanup_inactive_sessions(&shared);
                }
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
            }
        }
        log::info!("MediaGrid Transcode Monitor stopped.");
    });
}

fn check_and_cleanup_inactive_sessions(shared: &SharedRuntimeState) {
    let (storage_root, db_conn) = {
        let state = match shared.lock() {
            Ok(guard) => (guard.storage_root.clone(), guard.db_conn.clone()),
            Err(_) => return,
        };
        state
    };

    let conn = db_conn.lock().unwrap();
    let active_sessions = match crate::database::query_active_playback_sessions(&*conn) {
        Ok(s) => s,
        Err(_) => return,
    };

    let streams_dir = storage_root.join("cache/streams");
    let entries = match std::fs::read_dir(&streams_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let now = chrono::Utc::now();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let session_id = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        let active_session = active_sessions.iter().find(|s| s.id == session_id);

        let mut is_inactive = false;

        if active_session.is_none() {
            // No active session in database, clean it up immediately
            is_inactive = true;
        } else {
            // Check file modification times in the session directory to detect client inactivity
            let mut latest_mtime = SystemTime::UNIX_EPOCH;
            
            // Helper to recursively check file mtimes
            let check_dir = |dir_path: &std::path::Path| -> Option<SystemTime> {
                let mut max_time = SystemTime::UNIX_EPOCH;
                if let Ok(files) = std::fs::read_dir(dir_path) {
                    for f in files.flatten() {
                        let f_path = f.path();
                        if f_path.is_dir() {
                            if let Ok(sub_files) = std::fs::read_dir(&f_path) {
                                for sf in sub_files.flatten() {
                                    if let Ok(meta) = sf.metadata() {
                                        if let Ok(mtime) = meta.modified() {
                                            if mtime > max_time {
                                                max_time = mtime;
                                            }
                                        }
                                    }
                                }
                            }
                        } else if let Ok(meta) = f.metadata() {
                            if let Ok(mtime) = meta.modified() {
                                if mtime > max_time {
                                    max_time = mtime;
                                }
                            }
                        }
                    }
                }
                if max_time == SystemTime::UNIX_EPOCH {
                    None
                } else {
                    Some(max_time)
                }
            };

            if let Some(mtime) = check_dir(&path) {
                latest_mtime = mtime;
            }

            if latest_mtime != SystemTime::UNIX_EPOCH {
                if let Ok(duration) = SystemTime::now().duration_since(latest_mtime) {
                    // If no file has been modified in the last 120 seconds, the client has stopped reading
                    if duration.as_secs() > 120 {
                        is_inactive = true;
                    }
                }
            } else {
                // No files found or failed to read, check duration since session started
                if let Some(session) = active_session {
                    if let Ok(started_time) = chrono::DateTime::parse_from_rfc3339(&session.startedAt) {
                        let started_time = started_time.with_timezone(&chrono::Utc);
                        if now.signed_duration_since(started_time).num_seconds() > 120 {
                            is_inactive = true;
                        }
                    }
                }
            }
        }

        if is_inactive {
            log::info!("Cleaning up inactive/expired streaming session: {}", session_id);

            // 1. End session in DB
            let _ = crate::sessions::end_session(&*conn, &session_id);

            // 2. Kill transcode processes
            {
                let mut state = shared.lock().unwrap();
                let mut keys_to_remove = Vec::new();
                for key in state.active_transcodes.keys() {
                    if key.starts_with(&format!("{}_", session_id)) {
                        keys_to_remove.push(key.clone());
                    }
                }
                for key in keys_to_remove {
                    if let Some(mut child) = state.active_transcodes.remove(&key) {
                        let _ = child.kill();
                    }
                }
            }

            // 3. Delete files
            let _ = std::fs::remove_dir_all(&path);

            // 4. Emit STREAM_STOPPED and TRANSCODE_COMPLETED (if applicable)
            crate::sync::emit(
                shared,
                "STREAM_STOPPED",
                serde_json::json!({
                    "sessionId": session_id,
                }),
            );
        }
    }
}
