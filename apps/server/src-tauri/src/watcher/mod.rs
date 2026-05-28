use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use notify::{event::ModifyKind, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{jobs::JobManagerHandle, runtime::SharedRuntimeState};

pub fn start_watcher(
    shared: SharedRuntimeState,
    job_manager: Arc<JobManagerHandle>,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let root = {
        let state = shared.lock().unwrap();
        state.storage_root.clone()
    };

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
            Ok(watcher) => watcher,
            Err(error) => {
                log::error!("Failed to start watcher: {error}");
                return;
            }
        };

        for folder in [
            "media/movies",
            "media/music",
            "media/photos",
            "media/drive",
        ] {
            let _ = watcher.watch(&root.join(folder), RecursiveMode::Recursive);
        }

        loop {
            if *shutdown_rx.borrow() {
                break;
            }

            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(Ok(event)) => handle_event(&root, &job_manager, event.kind, event.paths),
                Ok(Err(error)) => log::error!("Watcher error: {error}"),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn handle_event(
    root: &Path,
    job_manager: &Arc<JobManagerHandle>,
    kind: EventKind,
    paths: Vec<PathBuf>,
) {
    if matches!(kind, EventKind::Modify(ModifyKind::Name(_))) && paths.len() >= 2 {
        let old_path = paths[0].clone();
        let new_path = paths[paths.len() - 1].clone();

        let category =
            category_for_path(root, &new_path).or_else(|| category_for_path(root, &old_path));

        if let Some(category) = category {
            job_manager.enqueue_rename_media(old_path, new_path, category);
        }
        return;
    }

    for path in paths {
        let Some(category) = category_for_path(root, &path) else {
            continue;
        };

        match kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                job_manager.enqueue_index_media(path.clone(), category.clone())
            }
            EventKind::Remove(_) => job_manager.enqueue_remove_media(path.clone()),
            _ => {}
        }
    }
}

fn category_for_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let text = relative.to_string_lossy().replace('\\', "/");

    for category in ["movies", "music", "photos", "drive"] {
        if text.starts_with(&format!("media/{category}")) {
            return Some(category.to_string());
        }
    }

    None
}
