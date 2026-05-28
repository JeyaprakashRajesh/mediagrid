use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use crate::transcoding::{get_ffmpeg_path, get_ffprobe_path};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SubtitleTrack {
    pub index: usize,          // Stream index or custom identifier
    pub language: String,
    pub title: String,
    pub is_embedded: bool,
    pub path: Option<String>,  // Path for external files
}

/// Probes a video file for embedded subtitles and looks for companion subtitle files.
pub fn get_subtitles_for_media(media_path: &Path) -> Vec<SubtitleTrack> {
    let mut tracks = Vec::new();

    // 1. Check for external companion files in the same directory
    if let Some(stem) = media_path.file_stem().and_then(|s| s.to_str()) {
        if let Some(parent) = media_path.parent() {
            let formats = [("vtt", "VTT"), ("srt", "SRT"), ("ass", "ASS")];
            for (ext, label) in formats {
                let candidate = parent.join(format!("{}.{}", stem, ext));
                if candidate.exists() {
                    tracks.push(SubtitleTrack {
                        index: tracks.len(),
                        language: "en".to_string(), // Default external language
                        title: format!("External {}", label),
                        is_embedded: false,
                        path: Some(candidate.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }

    // 2. Query embedded tracks using ffprobe
    if let Ok(embedded) = probe_embedded_subtitles(media_path) {
        for mut t in embedded {
            t.index = tracks.len(); // assign sequential ID
            tracks.push(t);
        }
    }

    tracks
}

/// Probes the media file for embedded subtitle streams using ffprobe.
fn probe_embedded_subtitles(path: &Path) -> Result<Vec<SubtitleTrack>, String> {
    let ffprobe_bin = get_ffprobe_path();
    let output = Command::new(ffprobe_bin)
        .arg("-v").arg("error")
        .arg("-select_streams").arg("s")
        .arg("-show_entries").arg("stream=index:stream_tags=language,title")
        .arg("-of").arg("json")
        .arg(path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("ffprobe failed to probe subtitle streams".to_string());
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        for (i, stream) in streams.iter().enumerate() {
            let tags = stream.get("tags");
            let language = tags
                .and_then(|t| t.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("eng")
                .to_string();
            let title = tags
                .and_then(|t| t.get("title"))
                .and_then(|title| title.as_str())
                .unwrap_or_else(|| "Subtitles")
                .to_string();

            list.push(SubtitleTrack {
                index: i,
                language,
                title: format!("Embedded [{}]", title),
                is_embedded: true,
                path: None,
            });
        }
    }

    Ok(list)
}

/// Extracts an embedded subtitle track to WebVTT.
pub fn extract_embedded_subtitle(
    video_path: &Path,
    stream_index: usize,
    output_vtt: &Path,
) -> Result<(), String> {
    if let Some(parent) = output_vtt.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    let ffmpeg_bin = get_ffmpeg_path();
    let output = Command::new(ffmpeg_bin)
        .arg("-y")
        .arg("-i").arg(video_path)
        .arg("-map").arg(format!("0:s:{}", stream_index))
        .arg(output_vtt)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "ffmpeg failed to extract subtitles: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Converts an external SRT/ASS subtitle file to WebVTT using FFmpeg.
pub fn convert_subtitle_to_vtt(
    input_sub: &Path,
    output_vtt: &Path,
) -> Result<(), String> {
    if let Some(parent) = output_vtt.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let ffmpeg_bin = get_ffmpeg_path();
    let output = Command::new(ffmpeg_bin)
        .arg("-y")
        .arg("-i").arg(input_sub)
        .arg(output_vtt)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "ffmpeg failed to convert subtitle: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}
