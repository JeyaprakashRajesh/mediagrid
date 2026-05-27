use std::{fs, io, path::{Path, PathBuf}};

pub const DEVELOPMENT_STORAGE_ROOT: &str = "C:/MediaGrid";

pub const REQUIRED_DIRECTORIES: &[&str] = &[
  "media",
  "media/movies",
  "media/music",
  "media/shows",
  "media/photos",
  "media/downloads",
  "cache",
  "cache/thumbnails",
  "cache/metadata",
  "cache/temp",
  "database",
  "logs",
  "config",
  "runtime",
];

pub struct FilesystemRepairResult {
  pub created_paths: Vec<PathBuf>,
}

pub fn development_root() -> PathBuf {
  PathBuf::from(DEVELOPMENT_STORAGE_ROOT)
}

pub fn ensure_layout(root: &Path) -> io::Result<FilesystemRepairResult> {
  fs::create_dir_all(root)?;

  let mut created_paths = Vec::new();

  for relative_path in REQUIRED_DIRECTORIES {
    let path = root.join(relative_path);

    if !path.exists() {
      fs::create_dir_all(&path)?;
      created_paths.push(path);
    }
  }

  // TODO: Replace development root path with installer-selected storage path during production setup.

  Ok(FilesystemRepairResult { created_paths })
}

pub fn config_path(root: &Path) -> PathBuf {
  root.join("config/config.json")
}

pub fn database_path(root: &Path) -> PathBuf {
  root.join("database/mediagrid.db")
}