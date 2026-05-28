#[derive(Debug, Clone, serde::Serialize)]
#[allow(non_snake_case)]
pub struct BandwidthStats {
    pub activeStreams: usize,
    pub totalBitrateBps: u64,
    pub currentEgressBps: u64,
}

/// Computes mock bandwidth statistics based on active sessions
pub fn get_bandwidth_stats(active_sessions_count: usize) -> BandwidthStats {
    let avg_bitrate_bps = 2_500_000; // Estimate 2.5 Mbps average per stream
    let total_bitrate = (active_sessions_count as u64) * avg_bitrate_bps;

    BandwidthStats {
        activeStreams: active_sessions_count,
        totalBitrateBps: total_bitrate,
        currentEgressBps: total_bitrate,
    }
}
