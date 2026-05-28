use crate::database::{WatchProgressRecord, upsert_watch_progress, get_watch_progress};
use rusqlite::Connection;

/// Saves the watch progress (0.0 to 1.0) for a given media item.
pub fn save_progress(
    conn: &Connection,
    media_id: String,
    progress: f64,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let record = WatchProgressRecord {
        mediaId: media_id,
        progress,
        updatedAt: now,
    };
    upsert_watch_progress(conn, &record).map_err(|e| e.to_string())
}

/// Retrieves the current watch progress for a given media item. Defaults to 0.0.
pub fn load_progress(
    conn: &Connection,
    media_id: &str,
) -> Result<f64, String> {
    match get_watch_progress(conn, media_id).map_err(|e| e.to_string())? {
        Some(record) => Ok(record.progress),
        None => Ok(0.0),
    }
}

/// Queries all media items currently in progress (between 1% and 95% watched).
pub fn get_continue_watching_items(
    conn: &Connection,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT m.id, m.title, m.path, m.type, m.category, m.createdAt, m.updatedAt, m.indexedAt, m.modifiedAt,
                   m.artist, m.album, m.mimeType, m.sizeBytes, m.thumbnailPath, m.duration, m.resolution,
                   m.codec, m.bitrate, m.fps, m.sampleRate, m.format, m.hash, w.progress, w.updatedAt
            FROM media m
            JOIN watch_progress w ON m.id = w.mediaId
            WHERE w.progress < 0.95 AND w.progress >= 0.01
            ORDER BY w.updatedAt DESC;
            "#,
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let size_bytes: Option<i64> = row.get(12)?;
            let bitrate: Option<i64> = row.get(17)?;
            let sample_rate: Option<i64> = row.get(19)?;

            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "path": row.get::<_, String>(2)?,
                "kind": row.get::<_, String>(3)?,
                "category": row.get::<_, String>(4)?,
                "createdAt": row.get::<_, String>(5)?,
                "updatedAt": row.get::<_, String>(6)?,
                "indexedAt": row.get::<_, String>(7)?,
                "modifiedAt": row.get::<_, Option<String>>(8)?,
                "artist": row.get::<_, Option<String>>(9)?,
                "album": row.get::<_, Option<String>>(10)?,
                "mimeType": row.get::<_, Option<String>>(11)?,
                "sizeBytes": size_bytes.map(|s| s as u64),
                "thumbnailPath": row.get::<_, Option<String>>(13)?,
                "duration": row.get::<_, Option<f64>>(14)?,
                "resolution": row.get::<_, Option<String>>(15)?,
                "codec": row.get::<_, Option<String>>(16)?,
                "bitrate": bitrate.map(|s| s as u64),
                "fps": row.get::<_, Option<f64>>(18)?,
                "sampleRate": sample_rate.map(|s| s as u32),
                "format": row.get::<_, Option<String>>(20)?,
                "hash": row.get::<_, Option<String>>(21)?,
                "progress": row.get::<_, f64>(22)?,
                "watchUpdatedAt": row.get::<_, String>(23)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(item) = r {
            list.push(item);
        }
    }
    Ok(list)
}
