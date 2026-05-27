use std::{fs, io, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

use crate::config::RuntimeConfig;

#[derive(Debug, Clone)]
pub struct MediaIndexItem {
  pub title: String,
  pub path: PathBuf,
  pub category: String,
  pub kind: String,
  pub created_at: String,
  pub updated_at: String,
}

pub fn scan_media(root: &Path, config: &RuntimeConfig) -> io::Result<Vec<MediaIndexItem>> {
  let mut items = Vec::new();

  for (category, relative_folder) in [
    ("movies", &config.media_folders.movies),
    ("music", &config.media_folders.music),
    ("shows", &config.media_folders.shows),
    ("photos", &config.media_folders.photos),
    ("downloads", &config.media_folders.downloads),
  ] {
    let folder = root.join(relative_folder);
    collect_media_for_category(&folder, category, &mut items)?;
  }

  Ok(items)
}

fn collect_media_for_category(
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
      collect_media_for_category(&path, category, items)?;
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

    items.push(MediaIndexItem {
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
      | ("music", "mp3")
      | ("music", "flac")
      | ("music", "wav")
      | ("shows", "mp4")
      | ("shows", "mkv")
      | ("shows", "avi")
      | ("photos", "jpg")
      | ("photos", "png")
      | ("photos", "webp")
  )
}

fn classify_kind(category: &str) -> String {
  match category {
    "movies" => "movie",
    "music" => "music",
    "shows" => "show",
    "photos" => "photo",
    _ => "download",
  }
  .to_string()
}

fn format_timestamp(time: SystemTime) -> String {
  time
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}