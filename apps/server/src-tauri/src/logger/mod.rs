#![allow(dead_code)]

pub fn init_logging() {
    log::info!("MediaGrid logging initialized");
}

pub fn info(module: &str, msg: &str) {
    log::info!("[{}] {}", module, msg);
}

pub fn warn(module: &str, msg: &str) {
    log::warn!("[{}] {}", module, msg);
}

pub fn error(module: &str, msg: &str) {
    log::error!("[{}] {}", module, msg);
}

pub fn startup(msg: &str) {
    log::info!("[STARTUP] {}", msg);
}

pub fn runtime_event(event: &str, details: &str) {
    log::info!("[EVENT] {}: {}", event, details);
}

pub fn scanner(msg: &str) {
    log::info!("[SCANNER] {}", msg);
}
