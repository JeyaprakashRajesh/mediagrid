use crate::database::{self, PairingTokenRecord};
use uuid::Uuid;

/// Generates a new 6-digit numeric pairing token expiring in 5 minutes using UUID.
pub fn generate_pairing_token(conn: &rusqlite::Connection) -> Result<String, String> {
    let mut token = String::new();
    
    // Generate code using UUID characters to avoid introducing additional external crates
    while token.len() < 6 {
        let uuid_str = Uuid::new_v4().to_string();
        for c in uuid_str.chars() {
            if c.is_ascii_digit() {
                token.push(c);
                if token.len() == 6 {
                    break;
                }
            }
        }
    }

    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(5)).to_rfc3339();
    let record = PairingTokenRecord {
        id: Uuid::new_v4().to_string(),
        token: token.clone(),
        expiresAt: expires_at,
        used: false,
    };

    database::insert_pairing_token(conn, &record).map_err(|e| e.to_string())?;
    Ok(token)
}

/// Redeems a pairing token for a new device. Marks token as used and registers device (untrusted).
pub fn redeem_pairing_token(
    conn: &rusqlite::Connection,
    token: &str,
    device_id: &str,
    device_name: &str,
    platform: &str,
) -> Result<(), String> {
    let pairing = match database::get_pairing_token(conn, token) {
        Ok(Some(p)) => p,
        Ok(None) => return Err("Invalid pairing code".to_string()),
        Err(e) => return Err(e.to_string()),
    };

    if pairing.used {
        return Err("Pairing code has already been used".to_string());
    }

    let expires_time = chrono::DateTime::parse_from_rfc3339(&pairing.expiresAt)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|e| e.to_string())?;

    if expires_time < chrono::Utc::now() {
        return Err("Pairing code has expired".to_string());
    }

    // Mark pairing token as used
    database::mark_pairing_token_used(conn, token).map_err(|e| e.to_string())?;

    // Register device as untrusted (needs admin approval)
    // We assume the first registered user is the owner (Admin)
    let user_id = match database::get_user_by_username(conn, "admin") {
        Ok(Some(u)) => u.id,
        _ => "default-admin-id".to_string(),
    };

    crate::devices::register_device(conn, &user_id, device_id, device_name, platform, false)?;

    Ok(())
}

/// Checks if a device is trusted. If so, issues a user session.
pub fn check_pairing_status(
    conn: &rusqlite::Connection,
    device_id: &str,
) -> Result<Option<crate::database::SessionRecord>, String> {
    let device = match database::get_device_by_id(conn, device_id) {
        Ok(Some(d)) => d,
        Ok(None) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    if device.trusted {
        // Issue persistent session
        let session = crate::sessions::create_user_session(conn, &device.userId, device_id)?;
        Ok(Some(session))
    } else {
        Ok(None)
    }
}
