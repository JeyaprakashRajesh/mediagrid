use std::{
    fs::File,
    io::{self, Read},
    path::Path,
    process::Command,
};

use serde::Deserialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Default)]
pub struct ExtractedMetadata {
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

#[derive(Debug, Deserialize)]
struct FFProbeOutput {
    streams: Vec<FFProbeStream>,
    format: Option<FFProbeFormat>,
}

#[derive(Debug, Deserialize)]
struct FFProbeStream {
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    bit_rate: Option<String>,
    avg_frame_rate: Option<String>,
    sample_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FFProbeFormat {
    duration: Option<String>,
    bit_rate: Option<String>,
    format_name: Option<String>,
}

/// Extract metadata for a media file at `path` with the given `category`.
///
/// Checks the metadata cache first. If a valid (non-stale) cache entry exists,
/// returns it immediately without running ffprobe. Otherwise runs the full
/// extraction pipeline and writes the result back to the cache.
///
/// The `storage_root` is used for cache directory resolution; pass `None` to
/// bypass caching (e.g. in unit tests).
pub fn extract(path: &Path, category: &str) -> io::Result<ExtractedMetadata> {
    extract_with_cache(path, category, None, None)
}

pub fn extract_with_cache(
    path: &Path,
    category: &str,
    storage_root: Option<&Path>,
    media_id: Option<&str>,
) -> io::Result<ExtractedMetadata> {
    // ── Cache lookup ──────────────────────────────────────────────────────────
    if let (Some(root), Some(id)) = (storage_root, media_id) {
        let media_mtime = std::fs::metadata(path).ok().and_then(|m| m.modified().ok());
        if let Some(cached) = crate::cache::read_metadata_cache(root, id, media_mtime) {
            log::debug!(target: "metadata", "cache hit for {id}");
            return Ok(cached);
        }
    }

    // ── Full extraction ───────────────────────────────────────────────────────
    let result = extract_inner(path, category)?;

    // ── Cache write ───────────────────────────────────────────────────────────
    if let (Some(root), Some(id)) = (storage_root, media_id) {
        crate::cache::write_metadata_cache(root, id, &result);
    }

    Ok(result)
}

fn extract_inner(path: &Path, category: &str) -> io::Result<ExtractedMetadata> {
    let file_metadata = std::fs::metadata(path)?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mut result = ExtractedMetadata {
        size_bytes: Some(file_metadata.len()),
        mime_type: mime_for_extension(&extension),
        ..Default::default()
    };

    result.hash = Some(compute_hash(path)?);

    if matches!(category, "movies" | "shows" | "music") {
        if let Ok(probed) = probe(path) {
            if let Some(format) = probed.format {
                result.duration = format.duration.and_then(|value| value.parse::<f64>().ok());
                result.bitrate = format.bit_rate.and_then(|value| value.parse::<u64>().ok());
                result.format = format.format_name;
            }

            if let Some(stream) = probed.streams.first() {
                result.codec = stream.codec_name.clone();
                result.resolution = match (stream.width, stream.height) {
                    (Some(width), Some(height)) => Some(format!("{width}x{height}")),
                    _ => None,
                };
                result.fps = stream
                    .avg_frame_rate
                    .as_ref()
                    .and_then(|value| parse_ratio(value));
                result.sample_rate = stream
                    .sample_rate
                    .as_ref()
                    .and_then(|value| value.parse::<u32>().ok());
                if result.bitrate.is_none() {
                    result.bitrate = stream
                        .bit_rate
                        .as_ref()
                        .and_then(|value| value.parse::<u64>().ok());
                }
            }
        }
    }

    if category == "photos" {
        if let Ok(image) = image::open(path) {
            result.resolution = Some(format!("{}x{}", image.width(), image.height()));
            result.format = Some(extension.clone());
        }
    }

    if category == "music" {
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if let Some(position) = stem.find(" - ") {
            result.artist = Some(stem[..position].trim().to_string());
        }
        if let Some(parent) = path.parent() {
            if let Some(album) = parent.file_name().and_then(|value| value.to_str()) {
                if album != "music" {
                    result.album = Some(album.to_string());
                }
            }
        }
    }

    Ok(result)
}

fn compute_hash(path: &Path) -> io::Result<String> {
    use std::io::Seek;
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let len = metadata.len();
    
    let mut hasher = Sha256::new();
    hasher.update(&len.to_le_bytes());

    let mut buffer = [0u8; 8192];

    if len <= 2 * 1024 * 1024 {
        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
    } else {
        let chunk_size = 1024 * 1024;
        
        let mut read_bytes = 0;
        while read_bytes < chunk_size {
            let to_read = std::cmp::min(buffer.len(), chunk_size - read_bytes);
            let read = file.read(&mut buffer[..to_read])?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            read_bytes += read;
        }

        if len > chunk_size as u64 {
            let _ = file.seek(std::io::SeekFrom::End(-(chunk_size as i64)));
            let mut read_bytes = 0;
            while read_bytes < chunk_size {
                let to_read = std::cmp::min(buffer.len(), chunk_size - read_bytes);
                let read = file.read(&mut buffer[..to_read])?;
                if read == 0 {
                    break;
                }
                hasher.update(&buffer[..read]);
                read_bytes += read;
            }
        }
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn probe(path: &Path) -> io::Result<FFProbeOutput> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-print_format")
        .arg("json")
        .arg("-show_format")
        .arg("-show_streams")
        .arg(path)
        .output()?;

    if !output.status.success() {
        return Err(io::Error::new(io::ErrorKind::Other, "ffprobe failed"));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn parse_ratio(value: &str) -> Option<f64> {
    let mut parts = value.split('/');
    let numerator = parts.next()?.parse::<f64>().ok()?;
    let denominator = parts.next()?.parse::<f64>().ok()?;
    if denominator == 0.0 {
        return None;
    }
    Some(numerator / denominator)
}

fn mime_for_extension(extension: &str) -> Option<String> {
    match extension {
        "mp4" => Some("video/mp4".to_string()),
        "mkv" => Some("video/x-matroska".to_string()),
        "avi" => Some("video/x-msvideo".to_string()),
        "mp3" => Some("audio/mpeg".to_string()),
        "flac" => Some("audio/flac".to_string()),
        "wav" => Some("audio/wav".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "png" => Some("image/png".to_string()),
        "webp" => Some("image/webp".to_string()),
        _ => None,
    }
}
