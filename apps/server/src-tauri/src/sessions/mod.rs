use crate::database::{
    self, PlaybackSessionRecord, insert_playback_session, update_playback_session_ended,
    SessionRecord,
};
use uuid::Uuid;

const SESSION_INACTIVITY_WINDOW: i64 = 60;

/// Creates a new playback session record in the database.
pub fn start_session(
    conn: &rusqlite::Connection,
    session_id: String,
    media_id: String,
    device_id: String,
) -> Result<PlaybackSessionRecord, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let record = PlaybackSessionRecord {
        id: session_id,
        mediaId: media_id,
        deviceId: device_id,
        startedAt: now,
        endedAt: None,
    };

    insert_playback_session(conn, &record).map_err(|e| e.to_string())?;
    Ok(record)
}

/// Marks an active playback session as ended in the database.
pub fn end_session(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    update_playback_session_ended(conn, session_id, &now).map_err(|e| e.to_string())?;
    Ok(())
}

/// Creates a new user session for auth and returns the SessionRecord.
pub fn create_user_session(
    conn: &rusqlite::Connection,
    user_id: &str,
    device_id: &str,
) -> Result<SessionRecord, String> {
    let session_id = Uuid::new_v4().to_string();
    
    // Generate JWT token
    let username = match database::get_user_by_id(conn, user_id) {
        Ok(Some(u)) => u.username,
        _ => "unknown".to_string(),
    };
    let role = match database::get_user_by_id(conn, user_id) {
        Ok(Some(u)) => u.role,
        _ => "Viewer".to_string(),
    };
    
    let token = crate::auth::generate_token(user_id, &username, &role)?;
    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(SESSION_INACTIVITY_WINDOW)).to_rfc3339();

    let record = SessionRecord {
        id: session_id,
        userId: user_id.to_string(),
        deviceId: device_id.to_string(),
        token,
        expiresAt: expires_at,
    };

    database::insert_session(conn, &record).map_err(|e| e.to_string())?;
    Ok(record)
}

/// Validates a user session token.
pub fn validate_user_session(
    conn: &rusqlite::Connection,
    token: &str,
) -> Result<SessionRecord, String> {
    // 1. Validate JWT signature; session expiry is enforced by the database window.
    let _claims = crate::auth::validate_token(token)?;

    // 2. Query session from database
    let session = match database::get_session_by_token(conn, token) {
        Ok(Some(s)) => s,
        Ok(None) => return Err("Session not found".to_string()),
        Err(e) => return Err(e.to_string()),
    };

    // 3. Additional database expiry validation
    let expires_time = chrono::DateTime::parse_from_rfc3339(&session.expiresAt)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|e| e.to_string())?;

    if expires_time < chrono::Utc::now() {
        // Expired, delete it
        let _ = database::delete_session(conn, token);
        return Err("Session expired".to_string());
    }

    // 4. Double check device still trusted
    if let Ok(Some(device)) = database::get_device_by_id(conn, &session.deviceId) {
        if !device.trusted {
            return Err("Device not trusted".to_string());
        }
    }

    let renewed_expires_at = (chrono::Utc::now() + chrono::Duration::minutes(SESSION_INACTIVITY_WINDOW)).to_rfc3339();
    let _ = database::update_session_expires_at(conn, &session.token, &renewed_expires_at);

    Ok(session)
}

/// Revokes a user session by token (logout).
pub fn revoke_user_session(
    conn: &rusqlite::Connection,
    token: &str,
) -> Result<(), String> {
    database::delete_session(conn, token).map_err(|e| e.to_string())
}

/// Revokes all active sessions for a device.
pub fn revoke_device_sessions(
    conn: &rusqlite::Connection,
    device_id: &str,
) -> Result<(), String> {
    database::delete_sessions_by_device(conn, device_id).map_err(|e| e.to_string())
}

/// Revokes all active sessions for a user.
pub fn revoke_user_sessions(
    conn: &rusqlite::Connection,
    user_id: &str,
) -> Result<(), String> {
    database::delete_sessions_by_user(conn, user_id).map_err(|e| e.to_string())
}
