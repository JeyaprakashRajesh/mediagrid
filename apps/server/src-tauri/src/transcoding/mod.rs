pub mod transcode_monitor;

use std::path::{Path, PathBuf};
use std::process::{Command, Child};
use std::io;

pub fn get_ffmpeg_path() -> PathBuf {
    // 1. Check winget location first (most recent install)
    let winget_path = PathBuf::from(r"C:\Users\rjeya\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe");
    if winget_path.exists() {
        return winget_path;
    }
    // 2. Check BlueStacks
    let bluestacks_path = PathBuf::from(r"C:\Program Files\BlueStacks_nxt\ffmpeg.exe");
    if bluestacks_path.exists() {
        return bluestacks_path;
    }
    // 3. Fallback to PATH
    PathBuf::from("ffmpeg")
}

pub fn get_ffprobe_path() -> PathBuf {
    // 1. Check winget location
    let winget_path = PathBuf::from(r"C:\Users\rjeya\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffprobe.exe");
    if winget_path.exists() {
        return winget_path;
    }
    // 2. Fallback to PATH
    PathBuf::from("ffprobe")
}

/// Spawns an FFmpeg child process to transcode a media file to HLS for a given quality.
pub fn spawn_hls_transcode(
    input_path: &Path,
    output_manifest: &Path,
    quality: &str,
    copy_codecs: bool,
) -> io::Result<Child> {
    let ffmpeg_bin = get_ffmpeg_path();
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.arg("-y")
       .arg("-i")
       .arg(input_path);

    // Scaling video if not copying and a specific quality is requested
    if !copy_codecs {
        match quality {
            "1080p" => {
                cmd.arg("-vf").arg("scale=1920:-2");
            }
            "720p" => {
                cmd.arg("-vf").arg("scale=1280:-2");
            }
            "480p" => {
                cmd.arg("-vf").arg("scale=854:-2");
            }
            _ => {}
        }
        cmd.arg("-c:v").arg("libx264")
           .arg("-preset").arg("superfast")
           .arg("-crf").arg("23")
           .arg("-c:a").arg("aac")
           .arg("-b:a").arg("128k");
    } else {
        cmd.arg("-c").arg("copy");
    }

    let segment_parent = output_manifest.parent().unwrap_or(Path::new(""));
    let segment_filename = segment_parent.join("segment_%d.ts");

    cmd.arg("-f").arg("hls")
       .arg("-hls_time").arg("6")
         .arg("-hls_playlist_type").arg("vod")
       .arg("-hls_segment_filename").arg(segment_filename)
       .arg(output_manifest);

    log::info!("Spawning ffmpeg: {:?}", cmd);
    cmd.spawn()
}
