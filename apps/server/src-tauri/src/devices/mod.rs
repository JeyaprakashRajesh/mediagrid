use crate::database::{self, DeviceRecord};

/// Registers a new device or updates last connected for an existing device.
pub fn register_device(
    conn: &rusqlite::Connection,
    user_id: &str,
    device_id: &str,
    name: &str,
    platform: &str,
    trusted: bool,
) -> Result<DeviceRecord, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Check if device already exists
    let existing = database::get_device_by_id(conn, device_id).map_err(|e| e.to_string())?;

    let record = if let Some(mut dev) = existing {
        dev.lastConnected = now.clone();
        // If device is already trusted, keep it trusted. If we passed trusted=true, upgrade it.
        if trusted {
            dev.trusted = true;
        }
        database::insert_device(conn, &dev).map_err(|e| e.to_string())?;
        dev
    } else {
        // New device
        let dev = DeviceRecord {
            id: device_id.to_string(),
            userId: user_id.to_string(),
            name: name.to_string(),
            platform: platform.to_string(),
            trusted,
            lastConnected: now,
        };
        database::insert_device(conn, &dev).map_err(|e| e.to_string())?;
        dev
    };

    Ok(record)
}

/// Sets the trust status of a device. If untrusted, revokes sessions.
pub fn set_device_trust(
    conn: &rusqlite::Connection,
    device_id: &str,
    trusted: bool,
) -> Result<(), String> {
    database::update_device_trust(conn, device_id, trusted).map_err(|e| e.to_string())?;

    if !trusted {
        // Revoke active sessions for this device
        let _ = crate::sessions::revoke_device_sessions(conn, device_id);
    }

    Ok(())
}

/// Renames a device.
pub fn rename_device(
    conn: &rusqlite::Connection,
    device_id: &str,
    name: &str,
) -> Result<(), String> {
    database::update_device_name(conn, device_id, name).map_err(|e| e.to_string())
}

/// Revokes (removes) a device completely from the database.
pub fn revoke_device(
    conn: &rusqlite::Connection,
    device_id: &str,
) -> Result<(), String> {
    database::delete_device(conn, device_id).map_err(|e| e.to_string())?;
    // Revoke sessions
    let _ = crate::sessions::revoke_device_sessions(conn, device_id);
    Ok(())
}
