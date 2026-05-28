use crate::media::MediaIndexItem;

/// Checks if a media item should be transcoded or can be direct-streamed.
pub fn should_transcode(item: &MediaIndexItem) -> bool {
    let extension = item.path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    // Incompatible containers require transcoding/remuxing
    if extension != "mp4" && extension != "webm" && extension != "mp3" && extension != "m4a" {
        return true;
    }

    // Incompatible codecs require transcoding
    if let Some(ref codec) = item.codec {
        let c = codec.to_lowercase();
        if !c.contains("h264") && !c.contains("avc") && !c.contains("aac") && !c.contains("mp3") {
            return true;
        }
    }

    false
}

/// Checks if a media item's codecs are natively compatible with HLS copy-codec streaming (without full transcoding).
pub fn can_copy_codecs(item: &MediaIndexItem) -> bool {
    if let Some(ref codec) = item.codec {
        let c = codec.to_lowercase();
        let has_h264 = c.contains("h264") || c.contains("avc");
        let has_aac = c.contains("aac") || c.contains("mp3") || c.contains("mp4a");
        
        has_h264 && has_aac
    } else {
        false
    }
}

