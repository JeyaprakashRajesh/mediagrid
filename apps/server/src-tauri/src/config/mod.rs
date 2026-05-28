use std::{
    fs, io,
    path::{Path, PathBuf},
};

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
    pub drive: String,
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
                drive: "media/drive".to_string(),
            },
        }
    }
}

pub fn validate_config(config: &RuntimeConfig) -> Result<(), String> {
    let root_path = Path::new(&config.storage_root);
    if !root_path.is_absolute() {
        return Err(format!(
            "storage_root path must be absolute: {}",
            config.storage_root
        ));
    }
    if root_path.exists() && !root_path.is_dir() {
        return Err(format!(
            "storage_root is not a directory: {}",
            config.storage_root
        ));
    }

    // Stricter write check
    if let Err(e) = fs::create_dir_all(root_path) {
        return Err(format!(
            "storage_root is not writable (cannot create directory): {}",
            e
        ));
    }
    let test_file = root_path.join(".mediagrid_write_test");
    if let Err(e) = fs::write(&test_file, "test") {
        return Err(format!(
            "storage_root is not writable (cannot write file): {}",
            e
        ));
    } else {
        let _ = fs::remove_file(test_file);
    }

    if config.server_port <= 1024 {
        return Err(format!(
            "server_port must be in range 1025-65535: {}",
            config.server_port
        ));
    }
    if config.websocket_port <= 1024 {
        return Err(format!(
            "websocket_port must be in range 1025-65535: {}",
            config.websocket_port
        ));
    }
    if config.server_port == config.websocket_port {
        return Err(format!(
            "server_port and websocket_port must be unique: {}",
            config.server_port
        ));
    }

    if config.media_folders.movies.is_empty() {
        return Err("media_folders.movies cannot be empty".to_string());
    }
    if config.media_folders.music.is_empty() {
        return Err("media_folders.music cannot be empty".to_string());
    }
    if config.media_folders.shows.is_empty() {
        return Err("media_folders.shows cannot be empty".to_string());
    }
    if config.media_folders.photos.is_empty() {
        return Err("media_folders.photos cannot be empty".to_string());
    }
    if config.media_folders.drive.is_empty() {
        return Err("media_folders.drive cannot be empty".to_string());
    }

    Ok(())
}

pub fn load_or_create(root: &Path) -> io::Result<RuntimeConfig> {
    let config_path = storage::config_path(root);

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)?;

        match serde_json::from_str::<RuntimeConfig>(&content) {
            Ok(config) => {
                if validate_config(&config).is_ok() {
                    Ok(config)
                } else {
                    let config = RuntimeConfig::defaults();
                    write_config(&config_path, &config)?;
                    Ok(config)
                }
            }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapConfig {
    pub storage_root: Option<String>,
}

impl BootstrapConfig {
    pub fn load_or_default() -> Self {
        let path = storage::global_config_dir().join("bootstrap.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<BootstrapConfig>(&content) {
                    return config;
                }
            }
        }
        Self { storage_root: None }
    }

    pub fn save(&self) -> io::Result<()> {
        let path = storage::global_config_dir().join("bootstrap.json");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        fs::write(path, content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_config_validation() {
        let temp_dir =
            std::env::temp_dir().join(format!("mediagrid_test_config_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let mut config = RuntimeConfig::defaults();
        config.storage_root = temp_dir.to_string_lossy().to_string();

        assert!(validate_config(&config).is_ok());

        config.server_port = 80;
        assert!(validate_config(&config).is_err());
        config.server_port = 3001;

        config.websocket_port = 3001;
        assert!(validate_config(&config).is_err());
        config.websocket_port = 3002;

        config.storage_root = "relative/path".to_string();
        assert!(validate_config(&config).is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_bootstrap_config_save_load() {
        let temp_dir =
            std::env::temp_dir().join(format!("mediagrid_test_bootstrap_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", &temp_dir);

        let mut cfg = BootstrapConfig::load_or_default();
        assert!(cfg.storage_root.is_none());

        cfg.storage_root = Some("D:/MyMediaGrid".to_string());
        cfg.save().expect("failed to save bootstrap config");

        let loaded = BootstrapConfig::load_or_default();
        assert_eq!(loaded.storage_root, Some("D:/MyMediaGrid".to_string()));

        if let Some(val) = old_appdata {
            std::env::set_var("APPDATA", val);
        } else {
            std::env::remove_var("APPDATA");
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
