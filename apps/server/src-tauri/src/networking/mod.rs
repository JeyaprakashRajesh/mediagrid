#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[allow(non_snake_case)]
pub struct TailscaleState {
    pub isInstalled: bool,
    pub isConnected: bool,
    pub tailnetIp: Option<String>,
    pub nodeName: Option<String>,
    pub tailnetName: Option<String>,
}

/// Detects if Tailscale is installed and gets its connectivity status.
pub fn get_tailscale_status() -> TailscaleState {
    // 1. Run tailscale --version to check if installed
    let installed = std::process::Command::new("tailscale")
        .arg("--version")
        .output()
        .is_ok();

    if !installed {
        return TailscaleState {
            isInstalled: false,
            isConnected: false,
            tailnetIp: None,
            nodeName: None,
            tailnetName: None,
        };
    }

    // 2. Run tailscale status --json
    let status_output = std::process::Command::new("tailscale")
        .arg("status")
        .arg("--json")
        .output();

    match status_output {
        Ok(output) if output.status.success() => {
            if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                let is_connected = json_val.get("BackendState")
                    .and_then(|v| v.as_str())
                    .map(|s| s == "Running")
                    .unwrap_or(false);

                let tailnet_ip = json_val.get("Self")
                    .and_then(|s| s.get("Tailaddr"))
                    .and_then(|a| a.as_str())
                    .map(|s| s.to_string());

                let node_name = json_val.get("Self")
                    .and_then(|s| s.get("HostName"))
                    .and_then(|h| h.as_str())
                    .map(|s| s.to_string());

                let tailnet_name = json_val.get("Self")
                    .and_then(|s| s.get("DNSName"))
                    .and_then(|d| d.as_str())
                    .map(|s| {
                        let parts: Vec<&str> = s.splitn(2, '.').collect();
                        if parts.len() > 1 {
                            parts[1].trim_end_matches('.').to_string()
                        } else {
                            s.trim_end_matches('.').to_string()
                        }
                    });

                     let tailnet_ip = tailnet_ip.or_else(fetch_tailscale_ip_v4);

                      TailscaleState {
                    isInstalled: true,
                    isConnected: is_connected,
                    tailnetIp: tailnet_ip,
                    nodeName: node_name,
                    tailnetName: tailnet_name,
                }
            } else {
                get_tailscale_fallback(true)
            }
        }
        _ => get_tailscale_fallback(true),
    }
}

fn get_tailscale_fallback(is_installed: bool) -> TailscaleState {
    let tailnet_ip = fetch_tailscale_ip_v4();

    TailscaleState {
        isInstalled: is_installed,
        isConnected: tailnet_ip.is_some(),
        tailnetIp: tailnet_ip,
        nodeName: None,
        tailnetName: None,
    }
}

fn fetch_tailscale_ip_v4() -> Option<String> {
    let ip_output = std::process::Command::new("tailscale")
        .arg("ip")
        .arg("-4")
        .output()
        .ok()?;

    if !ip_output.status.success() {
        return None;
    }

    let ip = String::from_utf8_lossy(&ip_output.stdout).trim().to_string();
    if ip.is_empty() {
        None
    } else {
        Some(ip)
    }
}
