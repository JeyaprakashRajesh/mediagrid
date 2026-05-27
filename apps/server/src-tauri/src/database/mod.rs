use std::{fs, io, path::Path};

use rusqlite::Connection;

use crate::{config::RuntimeConfig, media::MediaIndexItem, storage};

pub fn initialize(root: &Path, _config: &RuntimeConfig) -> io::Result<()> {
  let database_path = storage::database_path(root);

  if let Some(parent) = database_path.parent() {
    fs::create_dir_all(parent)?;
  }

  let connection = Connection::open(&database_path)
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

  connection
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        folder TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lastScan TEXT,
        runtimeVersion TEXT NOT NULL
      );
      "#,
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

  Ok(())
}

pub fn write_media_items(root: &Path, items: &[MediaIndexItem]) -> io::Result<()> {
  let database_path = storage::database_path(root);

  let mut connection = Connection::open(&database_path)
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

  let tx = connection
    .transaction()
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

  let sql = "INSERT INTO media (id, title, path, type, category, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(path) DO UPDATE SET
         title=excluded.title,
         type=excluded.type,
         category=excluded.category,
         updatedAt=excluded.updatedAt;";

  for item in items {
    let id = uuid::Uuid::new_v4().to_string();
    tx.execute(
      sql,
      rusqlite::params![
        id,
        item.title,
        item.path.to_string_lossy().to_string(),
        item.kind,
        item.category,
        item.created_at,
        item.updated_at
      ],
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
  }

  tx.commit()
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

  Ok(())
}