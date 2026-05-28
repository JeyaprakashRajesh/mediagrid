use crate::database::{self, SessionRecord};

/// Returns active authentication sessions.
pub fn get_active_sessions(conn: &rusqlite::Connection) -> Result<Vec<SessionRecord>, String> {
    database::query_active_sessions(conn).map_err(|e| e.to_string())
}

/// Returns details about remote accessibility, including Tailscale state and port status.
pub fn get_remote_runtime_info(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let tailscale = crate::networking::get_tailscale_status();
    let session_count = database::query_active_sessions(conn)
        .map(|list| list.len())
        .unwrap_or(0);
    
    let device_count = database::query_devices(conn)
        .map(|list| list.len())
        .unwrap_or(0);

    Ok(serde_json::json!({
        "tailscale": tailscale,
        "activeSessionsCount": session_count,
        "registeredDevicesCount": device_count,
        "isRemoteAccessEnabled": tailscale.isConnected,
    }))
}
