use std::sync::OnceLock;
use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{Instant, Duration};

type AttemptsMap = Mutex<HashMap<String, (usize, Instant)>>;

fn attempts_map() -> &'static AttemptsMap {
    static MAP: OnceLock<AttemptsMap> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Checks if an IP is currently rate-limited.
/// Returns the remaining ban duration in seconds, or None if not rate-limited.
pub fn check_login_rate_limit(ip: &str) -> Option<u64> {
    let mut map = attempts_map().lock().unwrap();
    if let Some(&(attempts, first_attempt)) = map.get(ip) {
        if attempts >= 5 {
            let elapsed = first_attempt.elapsed();
            if elapsed < Duration::from_secs(60) {
                return Some(60 - elapsed.as_secs());
            } else {
                // Expired ban, remove entry
                map.remove(ip);
            }
        }
    }
    None
}

/// Records a failed login attempt for an IP.
pub fn record_failed_login(ip: &str) {
    let mut map = attempts_map().lock().unwrap();
    let now = Instant::now();
    let entry = map.entry(ip.to_string()).or_insert((0, now));
    
    if entry.1.elapsed() > Duration::from_secs(60) {
        *entry = (1, now);
    } else {
        entry.0 += 1;
    }
}

/// Clears rate limiting state for an IP upon successful login.
pub fn record_successful_login(ip: &str) {
    let mut map = attempts_map().lock().unwrap();
    map.remove(ip);
}
