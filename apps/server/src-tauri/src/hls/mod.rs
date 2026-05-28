use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// Generates a master HLS playlist (.m3u8) referencing adaptive quality variants.
pub fn create_master_playlist(output_dir: &Path) -> io::Result<()> {
    fs::create_dir_all(output_dir)?;
    let master_path = output_dir.join("master.m3u8");
    let mut file = fs::File::create(&master_path)?;

    writeln!(file, "#EXTM3U")?;
    writeln!(file, "#EXT-X-VERSION:3")?;
    writeln!(file, "#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,NAME=\"1080p\"")?;
    writeln!(file, "1080p/manifest.m3u8")?;
    writeln!(file, "#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,NAME=\"720p\"")?;
    writeln!(file, "720p/manifest.m3u8")?;
    writeln!(file, "#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480,NAME=\"480p\"")?;
    writeln!(file, "480p/manifest.m3u8")?;

    Ok(())
}

/// Deletes all cached HLS files for the specified session.
pub fn cleanup_session_dir(root: &Path, session_id: &str) {
    let session_dir = root.join("cache/streams").join(session_id);
    if session_dir.exists() {
        let _ = fs::remove_dir_all(&session_dir);
    }
}
