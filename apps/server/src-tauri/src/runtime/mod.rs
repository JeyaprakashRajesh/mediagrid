use std::{path::PathBuf, sync::{Arc, Mutex}};

use crate::{
  config::{self, RuntimeConfig},
  database,
  logger,
  media,
  storage,
};

#[derive(Debug, Clone)]
pub struct RuntimeState {
  pub storage_root: PathBuf,
  pub config: RuntimeConfig,
  pub filesystem_repaired_paths: Vec<PathBuf>,
  pub indexed_media_count: usize,
}

pub type SharedRuntimeState = Arc<Mutex<RuntimeState>>;

pub fn bootstrap() -> SharedRuntimeState {
  logger::init_logging();

  let storage_root = storage::development_root();
  let repair_result = storage::ensure_layout(&storage_root).expect("failed to initialize storage");
  let config = config::load_or_create(&storage_root).expect("failed to load runtime config");
  database::initialize(&storage_root, &config).expect("failed to initialize database");
  let indexed_media = media::scan_media(&storage_root, &config).expect("failed to scan media");
  // Persist scanned media into the SQLite database so subsequent runs are durable
  database::write_media_items(&storage_root, &indexed_media).expect("failed to write media to database");

  Arc::new(Mutex::new(RuntimeState {
    storage_root,
    config,
    filesystem_repaired_paths: repair_result.created_paths,
    indexed_media_count: indexed_media.len(),
  }))
}