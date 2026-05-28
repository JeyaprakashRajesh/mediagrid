use std::{
    fs, io,
    path::{Path, PathBuf},
};

use rusqlite::Connection;

use crate::{config::RuntimeConfig, media::MediaIndexItem, storage};

#[derive(Debug, Clone, serde::Serialize)]
pub struct JobRecord {
    pub id: String,
    pub job_type: String,
    pub status: String,
    pub payload: String,
    pub priority: i64,
    pub attempts: i64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub fn initialize(root: &Path, _config: &RuntimeConfig) -> io::Result<Connection> {
    let database_path = storage::database_path(root);

    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let connection = Connection::open(&database_path)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    // Check if media table exists and check if it has the column 'artist'
    let table_info_exists: Result<i32, _> = connection.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='media';",
        [],
        |row| row.get(0),
    );
    if let Ok(1) = table_info_exists {
        let has_artist: Result<i32, _> = connection.query_row(
            "SELECT count(*) FROM pragma_table_info('media') WHERE name='artist';",
            [],
            |row| row.get(0),
        );
        if let Ok(0) = has_artist {
            // Recreate to add the metadata fields
            let _ = connection.execute("DROP TABLE media;", []);
        }
    }

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
        updatedAt TEXT NOT NULL,
        indexedAt TEXT,
        modifiedAt TEXT,
        artist TEXT,
        album TEXT,
        mimeType TEXT,
        sizeBytes INTEGER,
        thumbnailPath TEXT,
        duration REAL,
        resolution TEXT,
        codec TEXT,
        bitrate INTEGER,
        fps REAL,
        sampleRate INTEGER,
        format TEXT,
        hash TEXT
      );

      CREATE TABLE IF NOT EXISTS thumbnails (
        id TEXT PRIMARY KEY NOT NULL,
        mediaId TEXT NOT NULL,
        path TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        errorMessage TEXT,
        createdAt TEXT NOT NULL,
        completedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS runtime_events (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lastScan TEXT,
        runtimeVersion TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playback_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        mediaId TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS watch_progress (
        mediaId TEXT PRIMARY KEY NOT NULL,
        progress REAL NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcoding_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        mediaId TEXT NOT NULL,
        status TEXT NOT NULL,
        quality TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expiresAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        trusted INTEGER NOT NULL DEFAULT 0,
        lastConnected TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pairing_tokens (
        id TEXT PRIMARY KEY NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expiresAt TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS audio_playlists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        mediaIds TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audio_queues (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        currentIndex INTEGER NOT NULL DEFAULT 0,
        mediaIds TEXT NOT NULL,
        shuffle INTEGER NOT NULL DEFAULT 0,
        repeat TEXT NOT NULL DEFAULT 'none'
      );
      "#,
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    for (column, definition) in [
        ("artist", "TEXT"),
        ("album", "TEXT"),
        ("mimeType", "TEXT"),
        ("sizeBytes", "INTEGER"),
        ("thumbnailPath", "TEXT"),
        ("indexedAt", "TEXT"),
        ("modifiedAt", "TEXT"),
        ("duration", "REAL"),
        ("resolution", "TEXT"),
        ("codec", "TEXT"),
        ("bitrate", "INTEGER"),
        ("fps", "REAL"),
        ("sampleRate", "INTEGER"),
        ("format", "TEXT"),
        ("hash", "TEXT"),
    ] {
        ensure_column(&connection, "media", column, definition)?;
    }

    Ok(connection)
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> io::Result<()> {
    let exists: Result<i32, _> = connection.query_row(
        &format!("SELECT count(*) FROM pragma_table_info('{table}') WHERE name = ?1;"),
        rusqlite::params![column],
        |row| row.get(0),
    );

    if matches!(exists, Ok(0)) {
        connection
            .execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition};"),
                [],
            )
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    }

    Ok(())
}

pub fn write_media_items(connection: &mut Connection, items: &[MediaIndexItem]) -> io::Result<()> {
    let tx = connection
        .transaction()
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let sql = "INSERT INTO media (id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
       ON CONFLICT(path) DO UPDATE SET
         title=excluded.title,
         type=excluded.type,
         category=excluded.category,
         updatedAt=excluded.updatedAt,
         indexedAt=excluded.indexedAt,
         modifiedAt=excluded.modifiedAt,
         artist=excluded.artist,
         album=excluded.album,
         mimeType=excluded.mimeType,
         sizeBytes=excluded.sizeBytes,
         thumbnailPath=excluded.thumbnailPath,
         duration=excluded.duration,
         resolution=excluded.resolution,
         codec=excluded.codec,
         bitrate=excluded.bitrate,
         fps=excluded.fps,
         sampleRate=excluded.sampleRate,
         format=excluded.format,
         hash=excluded.hash;";

    for item in items {
        tx.execute(
            sql,
            rusqlite::params![
                item.id,
                item.title,
                item.path.to_string_lossy().to_string(),
                item.kind,
                item.category,
                item.created_at,
                item.updated_at,
                item.indexed_at,
                item.modified_at,
                item.artist,
                item.album,
                item.mime_type,
                item.size_bytes.map(|s| s as i64),
                item.thumbnail_path,
                item.duration,
                item.resolution,
                item.codec,
                item.bitrate.map(|value| value as i64),
                item.fps,
                item.sample_rate.map(|value| value as i64),
                item.format,
                item.hash
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    }

    tx.commit()
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    Ok(())
}

pub fn get_connection(root: &Path) -> Result<Connection, rusqlite::Error> {
    Connection::open(storage::database_path(root))
}

pub fn upsert_media_item(connection: &Connection, item: &MediaIndexItem) -> io::Result<()> {
    connection
    .execute(
      "INSERT INTO media (id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
       ON CONFLICT(path) DO UPDATE SET
         title=excluded.title,
         type=excluded.type,
         category=excluded.category,
         updatedAt=excluded.updatedAt,
         indexedAt=excluded.indexedAt,
         modifiedAt=excluded.modifiedAt,
         artist=excluded.artist,
         album=excluded.album,
         mimeType=excluded.mimeType,
         sizeBytes=excluded.sizeBytes,
         thumbnailPath=excluded.thumbnailPath,
         duration=excluded.duration,
         resolution=excluded.resolution,
         codec=excluded.codec,
         bitrate=excluded.bitrate,
         fps=excluded.fps,
         sampleRate=excluded.sampleRate,
         format=excluded.format,
         hash=excluded.hash;",
      rusqlite::params![
        item.id,
        item.title,
        item.path.to_string_lossy().to_string(),
        item.kind,
        item.category,
        item.created_at,
        item.updated_at,
        item.indexed_at,
        item.modified_at,
        item.artist,
        item.album,
        item.mime_type,
        item.size_bytes.map(|value| value as i64),
        item.thumbnail_path,
        item.duration,
        item.resolution,
        item.codec,
        item.bitrate.map(|value| value as i64),
        item.fps,
        item.sample_rate.map(|value| value as i64),
        item.format,
        item.hash,
      ],
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_media_by_id(connection: &Connection, id: &str) -> io::Result<Option<MediaIndexItem>> {
    let mut stmt = connection
    .prepare("SELECT id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash FROM media WHERE id = ?1 LIMIT 1;")
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![id], row_to_media_item) {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn get_media_by_path(
    connection: &Connection,
    path: &Path,
) -> io::Result<Option<MediaIndexItem>> {
    let mut stmt = connection
    .prepare("SELECT id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash FROM media WHERE path = ?1 LIMIT 1;")
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(
        rusqlite::params![path.to_string_lossy().to_string()],
        row_to_media_item,
    ) {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn remove_media_by_path(
    connection: &Connection,
    path: &Path,
) -> io::Result<Option<MediaIndexItem>> {
    let existing = get_media_by_path(connection, path)?;
    if existing.is_some() {
        connection
            .execute(
                "DELETE FROM media WHERE path = ?1;",
                rusqlite::params![path.to_string_lossy().to_string()],
            )
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    }
    Ok(existing)
}

pub fn remove_media_by_id(connection: &Connection, id: &str) -> io::Result<Option<MediaIndexItem>> {
    let existing = get_media_by_id(connection, id)?;
    if existing.is_some() {
        connection
            .execute("DELETE FROM media WHERE id = ?1;", rusqlite::params![id])
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    }
    Ok(existing)
}

pub fn update_media_item(connection: &Connection, item: &MediaIndexItem) -> io::Result<()> {
    connection
    .execute(
      "UPDATE media SET title = ?2, path = ?3, type = ?4, category = ?5, createdAt = ?6, updatedAt = ?7, indexedAt = ?8, modifiedAt = ?9, artist = ?10, album = ?11, mimeType = ?12, sizeBytes = ?13, thumbnailPath = ?14, duration = ?15, resolution = ?16, codec = ?17, bitrate = ?18, fps = ?19, sampleRate = ?20, format = ?21, hash = ?22 WHERE id = ?1;",
      rusqlite::params![
        item.id,
        item.title,
        item.path.to_string_lossy().to_string(),
        item.kind,
        item.category,
        item.created_at,
        item.updated_at,
        item.indexed_at,
        item.modified_at,
        item.artist,
        item.album,
        item.mime_type,
        item.size_bytes.map(|value| value as i64),
        item.thumbnail_path,
        item.duration,
        item.resolution,
        item.codec,
        item.bitrate.map(|value| value as i64),
        item.fps,
        item.sample_rate.map(|value| value as i64),
        item.format,
        item.hash,
      ],
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn remove_thumbnail_record(connection: &Connection, media_id: &str) -> io::Result<()> {
    connection
        .execute(
            "DELETE FROM thumbnails WHERE mediaId = ?1;",
            rusqlite::params![media_id],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn touch_thumbnail_record(
    connection: &Connection,
    media_id: &str,
    path: &str,
) -> io::Result<()> {
    connection
    .execute(
      "INSERT OR REPLACE INTO thumbnails (id, mediaId, path, createdAt) VALUES (?1, ?2, ?3, ?4);",
      rusqlite::params![uuid::Uuid::new_v4().to_string(), media_id, path, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn insert_job(connection: &Connection, job: &JobRecord) -> io::Result<()> {
    connection
    .execute(
      "INSERT OR REPLACE INTO jobs (id, type, status, payload, priority, attempts, errorMessage, createdAt, completedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);",
      rusqlite::params![
        job.id,
        job.job_type,
        job.status,
        job.payload,
        job.priority,
        job.attempts,
        job.error_message,
        job.created_at,
        job.completed_at,
      ],
    )
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_job_status(
    connection: &Connection,
    id: &str,
    status: &str,
    error_message: Option<String>,
    completed_at: Option<String>,
) -> io::Result<()> {
    connection
        .execute(
            "UPDATE jobs SET status = ?2, errorMessage = ?3, completedAt = ?4 WHERE id = ?1;",
            rusqlite::params![id, status, error_message, completed_at],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

/// Atomically increments the `attempts` counter for a job and returns the new count.
pub fn increment_job_attempts(connection: &Connection, id: &str) -> io::Result<i64> {
    connection
        .execute(
            "UPDATE jobs SET attempts = attempts + 1 WHERE id = ?1;",
            rusqlite::params![id],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let new_count = connection
        .query_row(
            "SELECT attempts FROM jobs WHERE id = ?1;",
            rusqlite::params![id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    Ok(new_count)
}

/// Returns the current `attempts` count for a job, or 0 if the job is not found.
pub fn get_job_attempts(connection: &Connection, id: &str) -> io::Result<i64> {
    match connection.query_row(
        "SELECT attempts FROM jobs WHERE id = ?1;",
        rusqlite::params![id],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(count) => Ok(count),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

/// Returns the IDs of all media items — used by the cleanup job to detect orphaned thumbnails.
pub fn list_all_media_ids(
    connection: &Connection,
) -> io::Result<std::collections::HashSet<String>> {
    let mut stmt = connection
        .prepare("SELECT id FROM media;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut ids = std::collections::HashSet::new();
    for row in rows {
        if let Ok(id) = row {
            ids.insert(id);
        }
    }
    Ok(ids)
}

pub fn list_all_media(connection: &Connection) -> io::Result<Vec<MediaIndexItem>> {
    let mut stmt = connection
    .prepare("SELECT id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash FROM media ORDER BY updatedAt DESC;")
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], row_to_media_item)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    let mut items = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            items.push(item);
        }
    }
    Ok(items)
}

pub fn count_media(connection: &Connection) -> io::Result<usize> {
    let total = connection
        .query_row("SELECT count(*) FROM media;", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(total.max(0) as usize)
}

pub fn record_runtime_event(
    connection: &Connection,
    event_type: &str,
    payload: &serde_json::Value,
) -> io::Result<()> {
    connection
        .execute(
            "INSERT INTO runtime_events (id, type, payload, createdAt) VALUES (?1, ?2, ?3, ?4);",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                event_type,
                payload.to_string(),
                chrono::Utc::now().to_rfc3339()
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn query_jobs(connection: &Connection) -> io::Result<Vec<JobRecord>> {
    let mut stmt = connection
    .prepare("SELECT id, type, status, payload, priority, attempts, errorMessage, createdAt, completedAt FROM jobs ORDER BY createdAt DESC;")
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(JobRecord {
                id: row.get(0)?,
                job_type: row.get(1)?,
                status: row.get(2)?,
                payload: row.get(3)?,
                priority: row.get(4)?,
                attempts: row.get(5)?,
                error_message: row.get(6)?,
                created_at: row.get(7)?,
                completed_at: row.get(8)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut jobs = Vec::new();
    for row in rows {
        if let Ok(job) = row {
            jobs.push(job);
        }
    }
    Ok(jobs)
}

fn row_to_media_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<MediaIndexItem> {
    let size_bytes: Option<i64> = row.get(12)?;
    let bitrate: Option<i64> = row.get(17)?;
    let sample_rate: Option<i64> = row.get(19)?;

    Ok(MediaIndexItem {
        id: row.get(0)?,
        title: row.get(1)?,
        path: PathBuf::from(row.get::<_, String>(2)?),
        kind: row.get(3)?,
        category: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        indexed_at: row
            .get(7)
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339()),
        modified_at: row.get(8).ok(),
        artist: row.get(9)?,
        album: row.get(10)?,
        mime_type: row.get(11)?,
        size_bytes: size_bytes.map(|value| value as u64),
        thumbnail_path: row.get(13)?,
        duration: row.get(14)?,
        resolution: row.get(15)?,
        codec: row.get(16)?,
        bitrate: bitrate.map(|value| value as u64),
        fps: row.get(18)?,
        sample_rate: sample_rate.map(|value| value as u32),
        format: row.get(20)?,
        hash: row.get(21)?,
    })
}

pub fn query_media_by_category(
    connection: &Connection,
    category: &str,
) -> io::Result<Vec<MediaIndexItem>> {
    let mut stmt = connection
    .prepare("SELECT id, title, path, type, category, createdAt, updatedAt, indexedAt, modifiedAt, artist, album, mimeType, sizeBytes, thumbnailPath, duration, resolution, codec, bitrate, fps, sampleRate, format, hash FROM media WHERE category = ?1;")
    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map(rusqlite::params![category], |row| {
            let size_bytes: Option<i64> = row.get(12)?;
            let bitrate: Option<i64> = row.get(17)?;
            let sample_rate: Option<i64> = row.get(19)?;
            Ok(MediaIndexItem {
                id: row.get(0)?,
                title: row.get(1)?,
                path: PathBuf::from(row.get::<_, String>(2)?),
                kind: row.get(3)?,
                category: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                indexed_at: row
                    .get(7)
                    .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339()),
                modified_at: row.get(8).ok(),
                artist: row.get(9)?,
                album: row.get(10)?,
                mime_type: row.get(11)?,
                size_bytes: size_bytes.map(|s| s as u64),
                thumbnail_path: row.get(13)?,
                duration: row.get(14)?,
                resolution: row.get(15)?,
                codec: row.get(16)?,
                bitrate: bitrate.map(|value| value as u64),
                fps: row.get(18)?,
                sample_rate: sample_rate.map(|value| value as u32),
                format: row.get(20)?,
                hash: row.get(21)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut items = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            items.push(item);
        }
    }

    Ok(items)
}

pub fn query_category_counts(
    connection: &Connection,
) -> io::Result<std::collections::HashMap<String, usize>> {
    let mut stmt = connection
        .prepare("SELECT category, count(*) FROM media GROUP BY category;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            let cat: String = row.get(0)?;
            let count: usize = row.get(1)?;
            Ok((cat, count))
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut counts = std::collections::HashMap::new();
    for row in rows {
        if let Ok((cat, count)) = row {
            counts.insert(cat, count);
        }
    }

    Ok(counts)
}

pub fn check_health_conn(conn: &Connection) -> bool {
    // integrity check
    let integrity_ok = match conn.query_row("PRAGMA integrity_check;", [], |row| {
        let val: String = row.get(0)?;
        Ok(val)
    }) {
        Ok(val) => val == "ok",
        Err(_) => false,
    };

    if !integrity_ok {
        return false;
    }

    // verify schema tables count
    let tables_ok = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('media', 'categories', 'runtime_state', 'thumbnails', 'jobs', 'runtime_events', 'users', 'sessions', 'devices', 'pairing_tokens');",
        [],
        |row| {
            let count: i32 = row.get(0)?;
            Ok(count)
        }
    );

    match tables_ok {
        Ok(count) => count >= 3,
        Err(_) => false,
    }
}

pub fn check_health(root: &Path) -> bool {
    let conn = match get_connection(root) {
        Ok(c) => c,
        Err(_) => return false,
    };
    check_health_conn(&conn)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct PlaybackSessionRecord {
    pub id: String,
    pub mediaId: String,
    pub deviceId: String,
    pub startedAt: String,
    pub endedAt: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct WatchProgressRecord {
    pub mediaId: String,
    pub progress: f64,
    pub updatedAt: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct TranscodingJobRecord {
    pub id: String,
    pub mediaId: String,
    pub status: String,
    pub quality: String,
    pub createdAt: String,
}

pub fn insert_playback_session(connection: &Connection, session: &PlaybackSessionRecord) -> io::Result<()> {
    connection
        .execute(
            "INSERT OR REPLACE INTO playback_sessions (id, mediaId, deviceId, startedAt, endedAt) VALUES (?1, ?2, ?3, ?4, ?5);",
            rusqlite::params![
                session.id,
                session.mediaId,
                session.deviceId,
                session.startedAt,
                session.endedAt,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_playback_session_ended(connection: &Connection, id: &str, ended_at: &str) -> io::Result<()> {
    connection
        .execute(
            "UPDATE playback_sessions SET endedAt = ?2 WHERE id = ?1;",
            rusqlite::params![id, ended_at],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_playback_session(connection: &Connection, id: &str) -> io::Result<Option<PlaybackSessionRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, mediaId, deviceId, startedAt, endedAt FROM playback_sessions WHERE id = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![id], |row| {
        Ok(PlaybackSessionRecord {
            id: row.get(0)?,
            mediaId: row.get(1)?,
            deviceId: row.get(2)?,
            startedAt: row.get(3)?,
            endedAt: row.get(4)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn query_active_playback_sessions(connection: &Connection) -> io::Result<Vec<PlaybackSessionRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, mediaId, deviceId, startedAt, endedAt FROM playback_sessions WHERE endedAt IS NULL ORDER BY startedAt DESC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PlaybackSessionRecord {
                id: row.get(0)?,
                mediaId: row.get(1)?,
                deviceId: row.get(2)?,
                startedAt: row.get(3)?,
                endedAt: row.get(4)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

pub fn upsert_watch_progress(connection: &Connection, progress: &WatchProgressRecord) -> io::Result<()> {
    connection
        .execute(
            "INSERT OR REPLACE INTO watch_progress (mediaId, progress, updatedAt) VALUES (?1, ?2, ?3);",
            rusqlite::params![
                progress.mediaId,
                progress.progress,
                progress.updatedAt,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_watch_progress(connection: &Connection, media_id: &str) -> io::Result<Option<WatchProgressRecord>> {
    let mut stmt = connection
        .prepare("SELECT mediaId, progress, updatedAt FROM watch_progress WHERE mediaId = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![media_id], |row| {
        Ok(WatchProgressRecord {
            mediaId: row.get(0)?,
            progress: row.get(1)?,
            updatedAt: row.get(2)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn query_continue_watching(connection: &Connection) -> io::Result<Vec<WatchProgressRecord>> {
    let mut stmt = connection
        .prepare("SELECT mediaId, progress, updatedAt FROM watch_progress WHERE progress < 0.95 ORDER BY updatedAt DESC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(WatchProgressRecord {
                mediaId: row.get(0)?,
                progress: row.get(1)?,
                updatedAt: row.get(2)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

pub fn insert_transcoding_job(connection: &Connection, job: &TranscodingJobRecord) -> io::Result<()> {
    connection
        .execute(
            "INSERT OR REPLACE INTO transcoding_jobs (id, mediaId, status, quality, createdAt) VALUES (?1, ?2, ?3, ?4, ?5);",
            rusqlite::params![
                job.id,
                job.mediaId,
                job.status,
                job.quality,
                job.createdAt,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_transcoding_job_status(connection: &Connection, id: &str, status: &str) -> io::Result<()> {
    connection
        .execute(
            "UPDATE transcoding_jobs SET status = ?2 WHERE id = ?1;",
            rusqlite::params![id, status],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn query_transcoding_jobs(connection: &Connection) -> io::Result<Vec<TranscodingJobRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, mediaId, status, quality, createdAt FROM transcoding_jobs ORDER BY createdAt DESC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TranscodingJobRecord {
                id: row.get(0)?,
                mediaId: row.get(1)?,
                status: row.get(2)?,
                quality: row.get(3)?,
                createdAt: row.get(4)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub passwordHash: String,
    pub role: String,
    pub createdAt: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct SessionRecord {
    pub id: String,
    pub userId: String,
    pub deviceId: String,
    pub token: String,
    pub expiresAt: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct DeviceRecord {
    pub id: String,
    pub userId: String,
    pub name: String,
    pub platform: String,
    pub trusted: bool,
    pub lastConnected: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[allow(non_snake_case)]
pub struct PairingTokenRecord {
    pub id: String,
    pub token: String,
    pub expiresAt: String,
    pub used: bool,
}

// Database Helpers for Users
pub fn insert_user(connection: &Connection, user: &UserRecord) -> io::Result<()> {
    connection
        .execute(
            "INSERT INTO users (id, username, passwordHash, role, createdAt) VALUES (?1, ?2, ?3, ?4, ?5);",
            rusqlite::params![
                user.id,
                user.username,
                user.passwordHash,
                user.role,
                user.createdAt,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_user_by_username(connection: &Connection, username: &str) -> io::Result<Option<UserRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, username, passwordHash, role, createdAt FROM users WHERE username = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![username], |row| {
        Ok(UserRecord {
            id: row.get(0)?,
            username: row.get(1)?,
            passwordHash: row.get(2)?,
            role: row.get(3)?,
            createdAt: row.get(4)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn get_user_by_id(connection: &Connection, id: &str) -> io::Result<Option<UserRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, username, passwordHash, role, createdAt FROM users WHERE id = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![id], |row| {
        Ok(UserRecord {
            id: row.get(0)?,
            username: row.get(1)?,
            passwordHash: row.get(2)?,
            role: row.get(3)?,
            createdAt: row.get(4)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn count_users(connection: &Connection) -> io::Result<usize> {
    let total = connection
        .query_row("SELECT count(*) FROM users;", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(total.max(0) as usize)
}

// Database Helpers for Sessions
pub fn insert_session(connection: &Connection, session: &SessionRecord) -> io::Result<()> {
    connection
        .execute(
            "INSERT OR REPLACE INTO sessions (id, userId, deviceId, token, expiresAt) VALUES (?1, ?2, ?3, ?4, ?5);",
            rusqlite::params![
                session.id,
                session.userId,
                session.deviceId,
                session.token,
                session.expiresAt,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_session_expires_at(connection: &Connection, token: &str, expires_at: &str) -> io::Result<()> {
    connection
        .execute(
            "UPDATE sessions SET expiresAt = ?2 WHERE token = ?1;",
            rusqlite::params![token, expires_at],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_session_by_token(connection: &Connection, token: &str) -> io::Result<Option<SessionRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, userId, deviceId, token, expiresAt FROM sessions WHERE token = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![token], |row| {
        Ok(SessionRecord {
            id: row.get(0)?,
            userId: row.get(1)?,
            deviceId: row.get(2)?,
            token: row.get(3)?,
            expiresAt: row.get(4)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn delete_session(connection: &Connection, token: &str) -> io::Result<()> {
    connection
        .execute("DELETE FROM sessions WHERE token = ?1;", rusqlite::params![token])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn delete_sessions_by_device(connection: &Connection, device_id: &str) -> io::Result<()> {
    connection
        .execute("DELETE FROM sessions WHERE deviceId = ?1;", rusqlite::params![device_id])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn delete_sessions_by_user(connection: &Connection, user_id: &str) -> io::Result<()> {
    connection
        .execute("DELETE FROM sessions WHERE userId = ?1;", rusqlite::params![user_id])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn query_active_sessions(connection: &Connection) -> io::Result<Vec<SessionRecord>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = connection
        .prepare("SELECT id, userId, deviceId, token, expiresAt FROM sessions WHERE expiresAt > ?1 ORDER BY expiresAt DESC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map(rusqlite::params![now], |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                userId: row.get(1)?,
                deviceId: row.get(2)?,
                token: row.get(3)?,
                expiresAt: row.get(4)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

// Database Helpers for Devices
pub fn insert_device(connection: &Connection, device: &DeviceRecord) -> io::Result<()> {
    let trusted_int = if device.trusted { 1 } else { 0 };
    connection
        .execute(
            "INSERT OR REPLACE INTO devices (id, userId, name, platform, trusted, lastConnected) VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
            rusqlite::params![
                device.id,
                device.userId,
                device.name,
                device.platform,
                trusted_int,
                device.lastConnected,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_device_by_id(connection: &Connection, id: &str) -> io::Result<Option<DeviceRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, userId, name, platform, trusted, lastConnected FROM devices WHERE id = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![id], |row| {
        let trusted_int: i32 = row.get(4)?;
        Ok(DeviceRecord {
            id: row.get(0)?,
            userId: row.get(1)?,
            name: row.get(2)?,
            platform: row.get(3)?,
            trusted: trusted_int != 0,
            lastConnected: row.get(5)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn query_devices(connection: &Connection) -> io::Result<Vec<DeviceRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, userId, name, platform, trusted, lastConnected FROM devices ORDER BY lastConnected DESC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            let trusted_int: i32 = row.get(4)?;
            Ok(DeviceRecord {
                id: row.get(0)?,
                userId: row.get(1)?,
                name: row.get(2)?,
                platform: row.get(3)?,
                trusted: trusted_int != 0,
                lastConnected: row.get(5)?,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

pub fn delete_device(connection: &Connection, id: &str) -> io::Result<()> {
    connection
        .execute("DELETE FROM devices WHERE id = ?1;", rusqlite::params![id])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_device_trust(connection: &Connection, id: &str, trusted: bool) -> io::Result<()> {
    let trusted_int = if trusted { 1 } else { 0 };
    connection
        .execute("UPDATE devices SET trusted = ?2 WHERE id = ?1;", rusqlite::params![id, trusted_int])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn update_device_name(connection: &Connection, id: &str, name: &str) -> io::Result<()> {
    connection
        .execute("UPDATE devices SET name = ?2 WHERE id = ?1;", rusqlite::params![id, name])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

// Database Helpers for Pairing Tokens
pub fn insert_pairing_token(connection: &Connection, pairing: &PairingTokenRecord) -> io::Result<()> {
    let used_int = if pairing.used { 1 } else { 0 };
    connection
        .execute(
            "INSERT OR REPLACE INTO pairing_tokens (id, token, expiresAt, used) VALUES (?1, ?2, ?3, ?4);",
            rusqlite::params![
                pairing.id,
                pairing.token,
                pairing.expiresAt,
                used_int,
            ],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_pairing_token(connection: &Connection, token: &str) -> io::Result<Option<PairingTokenRecord>> {
    let mut stmt = connection
        .prepare("SELECT id, token, expiresAt, used FROM pairing_tokens WHERE token = ?1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row(rusqlite::params![token], |row| {
        let used_int: i32 = row.get(3)?;
        Ok(PairingTokenRecord {
            id: row.get(0)?,
            token: row.get(1)?,
            expiresAt: row.get(2)?,
            used: used_int != 0,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn mark_pairing_token_used(connection: &Connection, token: &str) -> io::Result<()> {
    connection
        .execute("UPDATE pairing_tokens SET used = 1 WHERE token = ?1;", rusqlite::params![token])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn insert_audio_playlist(connection: &Connection, playlist: &crate::audio::AudioPlaylist) -> io::Result<()> {
    let media_ids_str = serde_json::to_string(&playlist.media_ids)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    connection
        .execute(
            "INSERT OR REPLACE INTO audio_playlists (id, name, mediaIds) VALUES (?1, ?2, ?3);",
            rusqlite::params![playlist.id, playlist.name, media_ids_str],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_audio_playlists(connection: &Connection) -> io::Result<Vec<crate::audio::AudioPlaylist>> {
    let mut stmt = connection
        .prepare("SELECT id, name, mediaIds FROM audio_playlists ORDER BY name ASC;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let rows = stmt
        .query_map([], |row| {
            let media_ids_str: String = row.get(2)?;
            let media_ids: Vec<String> = serde_json::from_str(&media_ids_str)
                .map_err(|error| rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error)))?;
            Ok(crate::audio::AudioPlaylist {
                id: row.get(0)?,
                name: row.get(1)?,
                media_ids,
            })
        })
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(rec) = r {
            list.push(rec);
        }
    }
    Ok(list)
}

pub fn delete_audio_playlist(connection: &Connection, id: &str) -> io::Result<()> {
    connection
        .execute("DELETE FROM audio_playlists WHERE id = ?1;", rusqlite::params![id])
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

pub fn get_audio_queue(connection: &Connection) -> io::Result<Option<crate::audio::AudioQueue>> {
    let mut stmt = connection
        .prepare("SELECT currentIndex, mediaIds, shuffle, repeat FROM audio_queues WHERE id = 1 LIMIT 1;")
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;

    match stmt.query_row([], |row| {
        let media_ids_str: String = row.get(1)?;
        let media_ids: Vec<String> = serde_json::from_str(&media_ids_str)
            .map_err(|error| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error)))?;
        let shuffle_int: i32 = row.get(2)?;
        Ok(crate::audio::AudioQueue {
            current_index: row.get(0)?,
            media_ids,
            shuffle: shuffle_int != 0,
            repeat: row.get(3)?,
        })
    }) {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(io::Error::new(io::ErrorKind::Other, error)),
    }
}

pub fn save_audio_queue(connection: &Connection, queue: &crate::audio::AudioQueue) -> io::Result<()> {
    let media_ids_str = serde_json::to_string(&queue.media_ids)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    let shuffle_int = if queue.shuffle { 1 } else { 0 };
    connection
        .execute(
            "INSERT OR REPLACE INTO audio_queues (id, currentIndex, mediaIds, shuffle, repeat) VALUES (1, ?1, ?2, ?3, ?4);",
            rusqlite::params![queue.current_index, media_ids_str, shuffle_int, queue.repeat],
        )
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_initialize_and_queries() {
        let temp_dir =
            std::env::temp_dir().join(format!("mediagrid_test_db_{}", uuid::Uuid::new_v4()));
        let root = temp_dir.as_path();
        let config = RuntimeConfig::defaults();

        let mut conn = initialize(root, &config).expect("failed to initialize db");
        assert!(check_health_conn(&conn));

        let item = MediaIndexItem {
            id: "test-id-123".to_string(),
            title: "Test Movie".to_string(),
            path: root.join("media/movies/movie.mp4"),
            category: "movies".to_string(),
            kind: "movie".to_string(),
            created_at: "123456789".to_string(),
            updated_at: "123456789".to_string(),
            indexed_at: "123456789".to_string(),
            modified_at: None,
            artist: None,
            album: None,
            mime_type: Some("video/mp4".to_string()),
            size_bytes: Some(1024),
            thumbnail_path: None,
            duration: None,
            resolution: None,
            codec: None,
            bitrate: None,
            fps: None,
            sample_rate: None,
            format: None,
            hash: None,
        };

        write_media_items(&mut conn, &[item.clone()]).expect("failed to write items");

        let queried = query_media_by_category(&conn, "movies").expect("failed to query category");
        assert_eq!(queried.len(), 1);
        assert_eq!(queried[0].title, "Test Movie");
        assert_eq!(queried[0].size_bytes, Some(1024));

        let counts = query_category_counts(&conn).expect("failed to query counts");
        assert_eq!(*counts.get("movies").unwrap_or(&0), 1);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
