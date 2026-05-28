use std::{
    fs, io,
    path::{Path, PathBuf},
    time::SystemTime,
};

use crate::metadata::ExtractedMetadata;

pub fn cache_root(root: &Path) -> PathBuf {
    root.join("cache")
}

pub fn thumbnails_dir(root: &Path) -> PathBuf {
    cache_root(root).join("thumbnails")
}

pub fn metadata_dir(root: &Path) -> PathBuf {
    cache_root(root).join("metadata")
}

pub fn temp_dir(root: &Path) -> PathBuf {
    cache_root(root).join("temp")
}

pub fn ensure_cache_layout(root: &Path) -> io::Result<()> {
    fs::create_dir_all(thumbnails_dir(root))?;
    fs::create_dir_all(metadata_dir(root))?;
    fs::create_dir_all(temp_dir(root))?;
    Ok(())
}

// ─── Metadata Cache ───────────────────────────────────────────────────────────

/// Serialisable mirror of `ExtractedMetadata` for JSON cache storage.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CachedMetadata {
    pub duration: Option<f64>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub bitrate: Option<u64>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub format: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<u64>,
    pub hash: Option<String>,
}

impl From<&ExtractedMetadata> for CachedMetadata {
    fn from(m: &ExtractedMetadata) -> Self {
        Self {
            duration: m.duration,
            resolution: m.resolution.clone(),
            codec: m.codec.clone(),
            bitrate: m.bitrate,
            fps: m.fps,
            sample_rate: m.sample_rate,
            format: m.format.clone(),
            artist: m.artist.clone(),
            album: m.album.clone(),
            mime_type: m.mime_type.clone(),
            size_bytes: m.size_bytes,
            hash: m.hash.clone(),
        }
    }
}

impl From<CachedMetadata> for ExtractedMetadata {
    fn from(c: CachedMetadata) -> Self {
        Self {
            duration: c.duration,
            resolution: c.resolution,
            codec: c.codec,
            bitrate: c.bitrate,
            fps: c.fps,
            sample_rate: c.sample_rate,
            format: c.format,
            artist: c.artist,
            album: c.album,
            mime_type: c.mime_type,
            size_bytes: c.size_bytes,
            hash: c.hash,
        }
    }
}

fn metadata_cache_path(root: &Path, id: &str) -> PathBuf {
    metadata_dir(root).join(format!("{id}.json"))
}

/// Persist extracted metadata to `cache/metadata/{id}.json`.
pub fn write_metadata_cache(root: &Path, id: &str, metadata: &ExtractedMetadata) {
    let path = metadata_cache_path(root, id);
    let cached = CachedMetadata::from(metadata);
    if let Ok(json) = serde_json::to_string(&cached) {
        let _ = fs::write(&path, json);
    }
}

/// Read cached metadata if the cache file is **newer** than `media_modified`.
/// Returns `None` on any miss (file absent, stale, parse error).
pub fn read_metadata_cache(
    root: &Path,
    id: &str,
    media_modified: Option<SystemTime>,
) -> Option<ExtractedMetadata> {
    let path = metadata_cache_path(root, id);

    let cache_modified = fs::metadata(&path).ok()?.modified().ok()?;

    // If media file is newer than cache → cache is stale
    if let Some(media_mtime) = media_modified {
        if media_mtime >= cache_modified {
            return None;
        }
    }

    let json = fs::read_to_string(&path).ok()?;
    let cached: CachedMetadata = serde_json::from_str(&json).ok()?;
    Some(ExtractedMetadata::from(cached))
}

/// List the media IDs for which a metadata cache entry exists.
pub fn list_cached_metadata_ids(root: &Path) -> Vec<String> {
    let dir = metadata_dir(root);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut ids = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                ids.push(stem.to_string());
            }
        }
    }
    ids
}
