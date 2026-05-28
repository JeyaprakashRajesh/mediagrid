use crate::runtime::SharedRuntimeState;

pub fn emit(shared: &SharedRuntimeState, event_type: &str, payload: serde_json::Value) {
    let (event_tx, db_conn) = {
        let state = shared.lock().unwrap();
        (state.event_tx.clone(), state.db_conn.clone())
    };

    let message = serde_json::json!({
      "type": event_type,
      "timestamp": chrono::Utc::now().to_rfc3339(),
      "payload": payload,
    })
    .to_string();

    if let Some(tx) = event_tx {
        let _ = tx.send(message);
    }

    let conn_result = db_conn.lock();
    match conn_result {
        Ok(conn) => {
            let _ = crate::database::record_runtime_event(&*conn, event_type, &payload);
        }
        Err(_) => {}
    }
}
