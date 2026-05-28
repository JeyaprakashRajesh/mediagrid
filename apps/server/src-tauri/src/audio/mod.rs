#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioPlaylist {
    pub id: String,
    pub name: String,
    pub media_ids: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioQueue {
    pub current_index: usize,
    pub media_ids: Vec<String>,
    pub shuffle: bool,
    pub repeat: String, // "none" | "one" | "all"
}

/// Checks if an audio file should be transcoded or can be direct-streamed.
pub fn should_transcode_audio(item: &crate::media::MediaIndexItem) -> bool {
    let extension = item.path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if extension == "mp3" || extension == "m4a" || extension == "aac" {
        return false;
    }

    if let Some(ref codec) = item.codec {
        let c = codec.to_lowercase();
        if c.contains("mp3") || c.contains("aac") || c.contains("alac") {
            return false;
        }
    }

    true
}

