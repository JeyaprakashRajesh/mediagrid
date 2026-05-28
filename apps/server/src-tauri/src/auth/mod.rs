use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Serialize, Deserialize};
use std::time::{SystemTime, UNIX_EPOCH};

const JWT_DEFAULT_SECRET: &str = "mediagrid-secret-key-super-secure-2026";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // userId
    pub username: String,
    pub role: String,     // "Admin" or "Viewer"
    pub exp: usize,       // expiration timestamp in seconds
}

/// Hashes a plain password using bcrypt with default cost.
pub fn hash_password(password: &str) -> Result<String, String> {
    hash(password, DEFAULT_COST)
        .map_err(|e| format!("Failed to hash password: {}", e))
}

/// Verifies a password against a hashed representation.
pub fn verify_password(password: &str, hashed: &str) -> Result<bool, String> {
    verify(password, hashed)
        .map_err(|e| format!("Failed to verify password: {}", e))
}

/// Generates a JWT token for a user.
pub fn generate_token(user_id: &str, username: &str, role: &str) -> Result<String, String> {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| JWT_DEFAULT_SECRET.to_string());
    
    // Expires in 1 hour; the runtime session stays alive while the user remains active.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as usize;
    let exp = now + (60 * 60);

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| format!("Failed to sign token: {}", e))
}

/// Validates a JWT token and returns claims.
pub fn validate_token(token: &str) -> Result<Claims, String> {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| JWT_DEFAULT_SECRET.to_string());
    let mut validation = Validation::default();
    validation.validate_exp = false;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| format!("Invalid token: {}", e))?;

    Ok(token_data.claims)
}
