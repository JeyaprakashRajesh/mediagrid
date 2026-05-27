use std::{fs, io, path::{Path, PathBuf}};

use serde::{Deserialize, Serialize};

use crate::storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
  pub storage_root: String,
  pub server_port: u16,
  pub websocket_port: u16,
  pub media_folders: MediaFolders,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFolders {
  pub movies: String,
  pub music: String,
  pub shows: String,
  pub photos: String,
  pub downloads: String,
}

impl RuntimeConfig {
  pub fn defaults() -> Self {
    Self {
      storage_root: storage::DEVELOPMENT_STORAGE_ROOT.to_string(),
      server_port: 3001,
      websocket_port: 3002,
      media_folders: MediaFolders {
        movies: "media/movies".to_string(),
        music: "media/music".to_string(),
        shows: "media/shows".to_string(),
        photos: "media/photos".to_string(),
        downloads: "media/downloads".to_string(),
      },
    }
  }
}

pub fn load_or_create(root: &Path) -> io::Result<RuntimeConfig> {
  let config_path = storage::config_path(root);

  if config_path.exists() {
    let content = fs::read_to_string(&config_path)?;

    match serde_json::from_str::<RuntimeConfig>(&content) {
      Ok(config) => Ok(config),
      Err(_) => {
        let config = RuntimeConfig::defaults();
        write_config(&config_path, &config)?;
        Ok(config)
      }
    }
  } else {
    let config = RuntimeConfig::defaults();
    write_config(&config_path, &config)?;
    Ok(config)
  }
}

fn write_config(path: &PathBuf, config: &RuntimeConfig) -> io::Result<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }

  let content = serde_json::to_string_pretty(config)
    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

  fs::write(path, content)
}