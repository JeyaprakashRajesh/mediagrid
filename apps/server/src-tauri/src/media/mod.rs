use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::config::RuntimeConfig;

#[derive(Debug, Clone)]
pub struct MediaIndexItem {
    pub id: String,
    pub title: String,
    pub path: PathBuf,
    pub category: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
    pub indexed_at: String,
    pub modified_at: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mime_type: Option<String>,
    pub size_bytes: Option<u64>,
    pub thumbnail_path: Option<String>,
    pub duration: Option<f64>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub bitrate: Option<u64>,
    pub fps: Option<f64>,
    pub sample_rate: Option<u32>,
    pub format: Option<String>,
    pub hash: Option<String>,
}

pub fn scan_media(root: &Path, config: &RuntimeConfig) -> io::Result<Vec<MediaIndexItem>> {
    let mut items = Vec::new();

    for (category, relative_folder) in [
        ("movies", &config.media_folders.movies),
        ("music", &config.media_folders.music),
        ("photos", &config.media_folders.photos),
        ("drive", &config.media_folders.drive),
    ] {
        let folder = root.join(relative_folder);
        collect_media_for_category(root, &folder, category, &mut items)?;
    }

    Ok(items)
}

fn collect_media_for_category(
    root: &Path,
    folder: &Path,
    category: &str,
    items: &mut Vec<MediaIndexItem>,
) -> io::Result<()> {
    if !folder.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            collect_media_for_category(root, &path, category, items)?;
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        if !is_supported(category, &extension) {
            continue;
        }

        let metadata = fs::metadata(&path)?;
        let modified = metadata.modified().unwrap_or(SystemTime::now());
        let updated_at = format_timestamp(modified);

        let size_bytes = Some(metadata.len());

        let mime_type = match extension.as_str() {
            "mp4" => Some("video/mp4".to_string()),
            "mkv" => Some("video/x-matroska".to_string()),
            "avi" => Some("video/x-msvideo".to_string()),
            "mov" => Some("video/quicktime".to_string()),
            "wmv" => Some("video/x-ms-wmv".to_string()),
            "mp3" => Some("audio/mpeg".to_string()),
            "flac" => Some("audio/flac".to_string()),
            "wav" => Some("audio/wav".to_string()),
            "aac" => Some("audio/aac".to_string()),
            "ogg" => Some("audio/ogg".to_string()),
            "m4a" => Some("audio/mp4".to_string()),
            "jpg" | "jpeg" => Some("image/jpeg".to_string()),
            "png" => Some("image/png".to_string()),
            "webp" => Some("image/webp".to_string()),
            "gif" => Some("image/gif".to_string()),
            "bmp" => Some("image/bmp".to_string()),
            "pdf" => Some("application/pdf".to_string()),
            "doc" | "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string()),
            "xls" | "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()),
            "ppt" | "pptx" => Some("application/vnd.openxmlformats-officedocument.presentationml.presentation".to_string()),
            "txt" => Some("text/plain".to_string()),
            "zip" => Some("application/zip".to_string()),
            "tar" => Some("application/x-tar".to_string()),
            "gz" => Some("application/gzip".to_string()),
            "rar" => Some("application/vnd.rar".to_string()),
            "7z" => Some("application/x-7z-compressed".to_string()),
            _ => None,
        };

        let mut artist = None;
        let mut album = None;

        if category == "music" {
            let file_stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            if let Some(pos) = file_stem.find(" - ") {
                artist = Some(file_stem[..pos].trim().to_string());
            }
            if let Some(parent) = path.parent() {
                if let Some(album_name) = parent.file_name().and_then(|s| s.to_str()) {
                    if album_name != "music" {
                        album = Some(album_name.to_string());
                    }
                }
            }
        }

        // Generate stable UUID v5 based on absolute path
        let id = uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            path.to_string_lossy().as_bytes(),
        )
        .to_string();

        items.push(MediaIndexItem {
            id,
            title: path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            path: path.clone(),
            category: category.to_string(),
            kind: classify_kind(category),
            created_at: updated_at.clone(),
            updated_at,
            indexed_at: format_timestamp(SystemTime::now()),
            modified_at: Some(format_timestamp(modified)),
            artist,
            album,
            mime_type,
            size_bytes,
            thumbnail_path: None,
            duration: None,
            resolution: None,
            codec: None,
            bitrate: None,
            fps: None,
            sample_rate: None,
            format: None,
            hash: None,
        });
    }

    Ok(())
}

fn is_supported(category: &str, extension: &str) -> bool {
    matches!(
        (category, extension),
        ("movies", "mp4")
            | ("movies", "mkv")
            | ("movies", "avi")
            | ("movies", "mov")
            | ("movies", "wmv")
            | ("music", "mp3")
            | ("music", "flac")
            | ("music", "wav")
            | ("music", "aac")
            | ("music", "ogg")
            | ("music", "m4a")

            | ("photos", "jpg")
            | ("photos", "jpeg")
            | ("photos", "png")
            | ("photos", "webp")
            | ("photos", "gif")
            | ("photos", "bmp")
            | ("drive", "mp4")
            | ("drive", "mkv")
            | ("drive", "avi")
            | ("drive", "mov")
            | ("drive", "mp3")
            | ("drive", "flac")
            | ("drive", "wav")
            | ("drive", "jpg")
            | ("drive", "jpeg")
            | ("drive", "png")
            | ("drive", "webp")
            | ("drive", "gif")
            | ("drive", "pdf")
            | ("drive", "doc")
            | ("drive", "docx")
            | ("drive", "xls")
            | ("drive", "xlsx")
            | ("drive", "ppt")
            | ("drive", "pptx")
            | ("drive", "txt")
            | ("drive", "zip")
            | ("drive", "tar")
            | ("drive", "gz")
            | ("drive", "rar")
            | ("drive", "7z")
    )
}

fn classify_kind(category: &str) -> String {
    match category {
        "movies" => "movie",
        "music" => "music",
        "photos" => "photo",
        _ => "drive",
    }
    .to_string()
}

fn format_timestamp(time: SystemTime) -> String {
    let duration = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs() as i64;
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_scanner_and_thumbnails() {
        let temp_dir =
            std::env::temp_dir().join(format!("mediagrid_test_media_{}", uuid::Uuid::new_v4()));
        let root = temp_dir.as_path();
        let config = RuntimeConfig::defaults();

        let photo_dir = root.join("media/photos");
        std::fs::create_dir_all(&photo_dir).unwrap();

        let photo_path = photo_dir.join("test.png");
        let img = image::ImageBuffer::from_pixel(1, 1, image::Rgb([255, 0, 0]));
        let dynamic_img = image::DynamicImage::ImageRgb8(img);
        dynamic_img.save(&photo_path).unwrap();

        let mut items = scan_media(root, &config).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].category, "photos");
        assert_eq!(items[0].kind, "photo");

        if let Ok(thumbnail_path) = crate::thumbnails::generate_thumbnail(root, &items[0]) {
            items[0].thumbnail_path = thumbnail_path;
        }
        assert!(items[0].thumbnail_path.is_some());

        let thumb_file = root.join(items[0].thumbnail_path.as_ref().unwrap());
        assert!(thumb_file.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
