use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::{
    database,
    jobs::JobManagerHandle,
    media::{self, MediaIndexItem},
    metadata,
    runtime::SharedRuntimeState,
};

#[derive(Clone)]
pub struct IndexingService {
    shared: SharedRuntimeState,
}

impl IndexingService {
    pub fn new(shared: SharedRuntimeState) -> Self {
        Self { shared }
    }

    pub async fn index_path(
        &self,
        path: PathBuf,
        category: String,
    ) -> Result<MediaIndexItem, String> {
        if !path.exists() {
            return Err(format!(
                "Media path does not exist: {}",
                path.to_string_lossy()
            ));
        }

        log_index_event(
            &self.shared,
            "index_file_started",
            Some(&path),
            Some(&category),
            None,
        );

        let item = build_media_item(&path, &category, None).await?;
        self.write_item(&item)?;
        self.publish_indexed(&item);
        Ok(item)
    }

    pub async fn rename_path(
        &self,
        old_path: PathBuf,
        new_path: PathBuf,
        category: String,
    ) -> Result<MediaIndexItem, String> {
        if !new_path.exists() {
            return Err(format!(
                "Renamed media path does not exist: {}",
                new_path.to_string_lossy()
            ));
        }

        let existing = self.get_media_by_path(&old_path)?;
        let Some(existing) = existing else {
            return self.index_path(new_path, category).await;
        };

        let mut item = build_media_item(&new_path, &category, Some(existing.id.clone())).await?;
        item.id = existing.id.clone();

        let hash_matches = existing.hash.is_some() && existing.hash == item.hash;
        if !hash_matches {
            log_index_event(
                &self.shared,
                "rename_hash_mismatch",
                Some(&new_path),
                Some(&category),
                Some(serde_json::json!({
                  "oldPath": old_path.to_string_lossy().to_string(),
                  "existingHash": existing.hash,
                  "newHash": item.hash,
                })),
            );
        }

        self.update_item(&item)?;
        self.publish_removed(&existing);
        self.publish_indexed(&item);
        self.publish_category(&existing.category);
        self.publish_category(&item.category);
        Ok(item)
    }

    pub async fn scan_and_sync(
        &self,
        manager: Arc<JobManagerHandle>,
        job_id: String,
    ) -> Result<(), String> {
        let (root, config) = {
            let state = self.shared.lock().unwrap();
            (state.storage_root.clone(), state.config.clone())
        };

        let discovered = media::scan_media(&root, &config).map_err(|error| error.to_string())?;
        let existing = self.list_media()?;
        let total = discovered.len().max(1);

        let discovered_paths: HashSet<String> = discovered
            .iter()
            .map(|item| item.path.to_string_lossy().to_string())
            .collect();

        let existing_by_path: HashMap<String, MediaIndexItem> = existing
            .iter()
            .cloned()
            .map(|item| (item.path.to_string_lossy().to_string(), item))
            .collect();

        let mut existing_by_hash: HashMap<String, Vec<MediaIndexItem>> = HashMap::new();
        for item in existing.iter().cloned() {
            if let Some(hash) = item.hash.clone() {
                existing_by_hash.entry(hash).or_default().push(item);
            }
        }

        let mut matched_existing_ids = HashSet::new();
        let mut processed = 0usize;

        set_scanning_state(&self.shared, true, 0.0, 0.0);
        log_index_event(
            &self.shared,
            "scan_started",
            None,
            None,
            Some(serde_json::json!({
              "discovered": discovered.len(),
            })),
        );

        for candidate in discovered {
            processed += 1;
            let path_string = candidate.path.to_string_lossy().to_string();

            if let Some(existing_item) = existing_by_path.get(&path_string) {
                if is_unchanged(existing_item, &candidate) {
                    log_index_event(
                        &self.shared,
                        "scan_skipped",
                        Some(&candidate.path),
                        Some(&candidate.category),
                        None,
                    );
                    set_progress(
                        &self.shared,
                        processed as f32 / total as f32,
                        processed as f32 / total as f32,
                    );
                    continue;
                }

                let item = build_media_item(
                    &candidate.path,
                    &candidate.category,
                    Some(existing_item.id.clone()),
                )
                .await?;
                self.update_item(&item)?;
                self.publish_indexed(&item);
                self.publish_category(&item.category);
                matched_existing_ids.insert(existing_item.id.clone());
                manager.enqueue_thumbnail(item.id.clone());
                log_index_event(
                    &self.shared,
                    "scan_reindexed",
                    Some(&candidate.path),
                    Some(&candidate.category),
                    None,
                );
                set_progress(
                    &self.shared,
                    processed as f32 / total as f32,
                    processed as f32 / total as f32,
                );
                continue;
            }

            let candidate_item =
                build_media_item(&candidate.path, &candidate.category, None).await?;

            if let Some(rename_source) = existing_by_hash
                .get(candidate_item.hash.as_deref().unwrap_or_default())
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| !matched_existing_ids.contains(&item.id))
                        .cloned()
                })
            {
                matched_existing_ids.insert(rename_source.id.clone());
                let mut renamed = candidate_item.clone();
                renamed.id = rename_source.id.clone();
                self.update_item(&renamed)?;
                self.publish_removed(&rename_source);
                self.publish_indexed(&renamed);
                self.publish_category(&rename_source.category);
                self.publish_category(&renamed.category);
                log_index_event(
                    &self.shared,
                    "rename_detected",
                    Some(&renamed.path),
                    Some(&renamed.category),
                    Some(serde_json::json!({
                      "from": rename_source.path.to_string_lossy().to_string(),
                      "to": renamed.path.to_string_lossy().to_string(),
                      "mediaId": renamed.id,
                    })),
                );
                manager.enqueue_thumbnail(renamed.id.clone());
                set_progress(
                    &self.shared,
                    processed as f32 / total as f32,
                    processed as f32 / total as f32,
                );
                continue;
            }

            self.write_item(&candidate_item)?;
            self.publish_indexed(&candidate_item);
            self.publish_category(&candidate_item.category);
            manager.enqueue_thumbnail(candidate_item.id.clone());
            log_index_event(
                &self.shared,
                "scan_indexed",
                Some(&candidate_item.path),
                Some(&candidate_item.category),
                None,
            );
            set_progress(
                &self.shared,
                processed as f32 / total as f32,
                processed as f32 / total as f32,
            );
        }

        for existing_item in existing {
            if matched_existing_ids.contains(&existing_item.id) {
                continue;
            }

            if !discovered_paths.contains(&existing_item.path.to_string_lossy().to_string()) {
                self.remove_item(&existing_item)?;
                self.publish_removed(&existing_item);
                self.publish_category(&existing_item.category);
                log_index_event(
                    &self.shared,
                    "scan_removed",
                    Some(&existing_item.path),
                    Some(&existing_item.category),
                    Some(serde_json::json!({
                      "mediaId": existing_item.id,
                    })),
                );
            }
        }

        update_indexed_count(&self.shared);
        set_scanning_state(&self.shared, false, 1.0, 1.0);
        log_index_event(
            &self.shared,
            "scan_completed",
            None,
            None,
            Some(serde_json::json!({
              "jobId": job_id,
            })),
        );
        crate::sync::emit(
            &self.shared,
            "JOB_COMPLETED",
            serde_json::json!({"jobId": job_id, "jobType": "scan"}),
        );
        Ok(())
    }

    fn write_item(&self, item: &MediaIndexItem) -> Result<(), String> {
        let state = self.shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::upsert_media_item(&*conn, item).map_err(|error| error.to_string())
    }

    fn update_item(&self, item: &MediaIndexItem) -> Result<(), String> {
        let state = self.shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::update_media_item(&*conn, item).map_err(|error| error.to_string())
    }

    fn remove_item(&self, item: &MediaIndexItem) -> Result<(), String> {
        let state = self.shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::remove_media_by_id(&*conn, &item.id).map_err(|error| error.to_string())?;
        let _ = database::remove_thumbnail_record(&*conn, &item.id);
        Ok(())
    }

    fn list_media(&self) -> Result<Vec<MediaIndexItem>, String> {
        let state = self.shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::list_all_media(&*conn).map_err(|error| error.to_string())
    }

    fn get_media_by_path(&self, path: &Path) -> Result<Option<MediaIndexItem>, String> {
        let state = self.shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::get_media_by_path(&*conn, path).map_err(|error| error.to_string())
    }

    fn publish_indexed(&self, item: &MediaIndexItem) {
        crate::sync::emit(
            &self.shared,
            "MEDIA_ADDED",
            serde_json::json!({
              "id": item.id,
              "title": item.title,
              "path": item.path.to_string_lossy().to_string(),
              "kind": item.kind,
              "category": item.category,
              "createdAt": item.created_at,
              "updatedAt": item.updated_at,
              "indexedAt": item.indexed_at,
              "modifiedAt": item.modified_at,
              "artist": item.artist,
              "album": item.album,
              "mimeType": item.mime_type,
              "sizeBytes": item.size_bytes,
              "thumbnailPath": item.thumbnail_path,
              "duration": item.duration,
              "resolution": item.resolution,
              "codec": item.codec,
              "bitrate": item.bitrate,
              "fps": item.fps,
              "sampleRate": item.sample_rate,
              "format": item.format,
              "hash": item.hash,
            }),
        );
    }

    fn publish_removed(&self, item: &MediaIndexItem) {
        crate::sync::emit(
            &self.shared,
            "MEDIA_REMOVED",
            serde_json::json!({
              "mediaId": item.id,
              "path": item.path.to_string_lossy().to_string(),
              "category": item.category,
            }),
        );
    }

    fn publish_category(&self, category: &str) {
        let (item_count, last_scanned_at) = {
            let state = self.shared.lock().unwrap();
            let conn = state.db_conn.lock().unwrap();
            let counts = database::query_category_counts(&*conn).unwrap_or_default();
            (
                counts.get(category).copied().unwrap_or(0),
                state.last_scan_at.clone(),
            )
        };

        let category_name = match category {
            "movies" => "Movies",
            "music" => "Music",
            "shows" => "Shows",
            "photos" => "Photos",
            "drive" => "Drive",
            _ => category,
        };

        crate::sync::emit(
            &self.shared,
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
}

async fn build_media_item(
    path: &Path,
    category: &str,
    id_override: Option<String>,
) -> Result<MediaIndexItem, String> {
    let category = category.to_string();
    let path = path.to_path_buf();
    let extracted = tokio::task::spawn_blocking({
        let path = path.clone();
        let category = category.clone();
        move || metadata::extract(&path, &category)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;

    let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
    let modified = metadata.modified().unwrap_or(std::time::SystemTime::now());
    let updated_at = chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339();
    let id = id_override.unwrap_or_else(|| {
        uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            path.to_string_lossy().as_bytes(),
        )
        .to_string()
    });

    Ok(MediaIndexItem {
        id,
        title: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        path,
        category: category.clone(),
        kind: classify_kind(&category),
        created_at: updated_at.clone(),
        updated_at: updated_at.clone(),
        indexed_at: chrono::Utc::now().to_rfc3339(),
        modified_at: Some(updated_at),
        artist: extracted.artist,
        album: extracted.album,
        mime_type: extracted.mime_type,
        size_bytes: extracted.size_bytes,
        thumbnail_path: None,
        duration: extracted.duration,
        resolution: extracted.resolution,
        codec: extracted.codec,
        bitrate: extracted.bitrate,
        fps: extracted.fps,
        sample_rate: extracted.sample_rate,
        format: extracted.format,
        hash: extracted.hash,
    })
}

fn classify_kind(category: &str) -> String {
    match category {
        "movies" => "movie".to_string(),
        "music" => "music".to_string(),
        "shows" => "show".to_string(),
        "photos" => "photo".to_string(),
        _ => "drive".to_string(),
    }
}

fn is_unchanged(existing: &MediaIndexItem, candidate: &MediaIndexItem) -> bool {
    existing.updated_at == candidate.updated_at
        && existing.size_bytes == candidate.size_bytes
        && existing.modified_at == candidate.modified_at
}

fn set_scanning_state(
    shared: &SharedRuntimeState,
    is_scanning: bool,
    scan_progress: f32,
    indexing_progress: f32,
) {
    let mut state = shared.lock().unwrap();
    state.is_scanning = is_scanning;
    state.scan_progress = scan_progress;
    state.indexing_progress = indexing_progress;
}

fn set_progress(shared: &SharedRuntimeState, scan_progress: f32, indexing_progress: f32) {
    let mut state = shared.lock().unwrap();
    state.scan_progress = scan_progress;
    state.indexing_progress = indexing_progress;
}

fn update_indexed_count(shared: &SharedRuntimeState) {
    let count = {
        let state = shared.lock().unwrap();
        let conn = state.db_conn.lock().unwrap();
        database::count_media(&*conn).unwrap_or(0)
    };
    let mut state = shared.lock().unwrap();
    state.indexed_media_count = count;
    state.last_scan_at = Some(chrono::Utc::now().to_rfc3339());
}

fn log_index_event(
    shared: &SharedRuntimeState,
    action: &str,
    path: Option<&Path>,
    category: Option<&str>,
    details: Option<serde_json::Value>,
) {
    let payload = serde_json::json!({
      "action": action,
      "path": path.map(|value| value.to_string_lossy().to_string()),
      "category": category,
      "details": details,
    });

    log::info!(target: "indexing", "{}", payload);
    crate::sync::emit(shared, "INDEXING_TRACE", payload);
}
