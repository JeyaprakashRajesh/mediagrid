use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub const DEVELOPMENT_STORAGE_ROOT: &str = "C:/MediaGrid";

pub const REQUIRED_DIRECTORIES: &[&str] = &[
    "media",
    "media/movies",
    "media/music",
    "media/photos",
    "media/drive",
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

pub fn global_config_dir() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data).join("MediaGrid")
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home).join(".mediagrid")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".mediagrid")
    } else {
        std::env::temp_dir().join("mediagrid")
    }
}

pub fn get_available_drives() -> Vec<String> {
    let mut drives = Vec::new();
    #[cfg(windows)]
    {
        for letter in b'C'..=b'Z' {
            let drive_path = format!("{}:\\", letter as char);
            if Path::new(&drive_path).exists() {
                drives.push(drive_path);
            }
        }
    }
    #[cfg(not(windows))]
    {
        drives.push("/".to_string());
    }
    drives
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ensure_layout() {
        let temp_dir =
            std::env::temp_dir().join(format!("mediagrid_test_storage_{}", uuid::Uuid::new_v4()));
        let root = temp_dir.as_path();

        let result = ensure_layout(root).expect("failed to ensure layout");
        assert!(!result.created_paths.is_empty());

        let movies_dir = root.join("media/movies");
        assert!(movies_dir.exists());

        let second_result = ensure_layout(root).expect("failed second call");
        assert!(second_result.created_paths.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
