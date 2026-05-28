use std::{io, path::Path, process::Command};

use image::{ImageBuffer, Rgb};

use crate::{cache, media::MediaIndexItem};

// ── Public API ────────────────────────────────────────────────────────────────

/// Generate (or retrieve from cache) a thumbnail for `item`.
///
/// Returns a relative path string like `"cache/thumbnails/{id}.jpg"` which is
/// always valid — either a real thumbnail or a placeholder.
pub fn generate_thumbnail(root: &Path, item: &MediaIndexItem) -> io::Result<Option<String>> {
    let thumbnail_dir = cache::thumbnails_dir(root);
    std::fs::create_dir_all(&thumbnail_dir)?;

    let output_path = thumbnail_dir.join(format!("{}.jpg", item.id));

    // Return cached thumbnail if it already exists
    if output_path.exists() {
        return Ok(Some(format!("cache/thumbnails/{}.jpg", item.id)));
    }

    // Attempt category-specific generation
    let gen_result = match item.category.as_str() {
        "photos" => generate_photo_thumbnail(&item.path, &output_path),
        "movies" => generate_video_thumbnail(&item.path, item.duration, &output_path),
        "music" => generate_audio_cover_thumbnail(&item.path, &output_path),
        _ => Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "no thumbnail for category",
        )),
    };

    if gen_result.is_err() || !output_path.exists() {
        // Generation failed (or unsupported) — write a placeholder instead
        let placeholder_path = thumbnail_dir.join(format!("{}.jpg", item.id));
        write_placeholder(&placeholder_path, &item.category)?;
    }

    Ok(Some(format!("cache/thumbnails/{}.jpg", item.id)))
}

// ── Thumbnail generators ───────────────────────────────────────────────────────

fn generate_photo_thumbnail(source: &Path, output: &Path) -> io::Result<()> {
    let image = image::open(source).map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    let thumbnail = image.thumbnail(320, 320);
    thumbnail
        .save(output)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))
}

fn generate_video_thumbnail(source: &Path, duration: Option<f64>, output: &Path) -> io::Result<()> {
    let seek = duration.unwrap_or(10.0) * 0.10;
    let seek_arg = format!("{seek:.3}");

    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-ss")
        .arg(seek_arg)
        .arg("-i")
        .arg(source)
        .arg("-frames:v")
        .arg("1")
        .arg("-update")
        .arg("1")
        .arg("-vf")
        .arg("scale=320:-1")
        .arg("-f")
        .arg("image2")
        .arg(output)
        .status()?;

    if status.success() {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::Other, "ffmpeg video thumbnail failed"))
    }
}

fn generate_audio_cover_thumbnail(source: &Path, output: &Path) -> io::Result<()> {
    // Extract the embedded cover art from the audio file.
    // -frames:v 1  — only decode one video (cover) frame
    // -update 1    — tell the image2 muxer this is a single static file,
    //                not an image sequence (prevents the "pattern is invalid" error)
    // -f image2    — explicitly select the image2 muxer
    let status = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(source)
        .arg("-an")
        .arg("-frames:v")
        .arg("1")
        .arg("-update")
        .arg("1")
        .arg("-vf")
        .arg("scale=320:-1")
        .arg("-f")
        .arg("image2")
        .arg(output)
        .status()?;

    if status.success() {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::Other, "ffmpeg audio cover extraction failed"))
    }
}

// ── Placeholder generator ─────────────────────────────────────────────────────

/// Write a 320×320 placeholder JPEG whose colour depends on the media category.
///
/// The image uses a dark background with a subtle cross-hatch indicator that
/// can be distinguished from a real thumbnail at a glance.
fn write_placeholder(output: &Path, category: &str) -> io::Result<()> {
    const W: u32 = 320;
    const H: u32 = 320;

    // Pick a category-specific background colour
    let bg: Rgb<u8> = match category {
        "movies" => Rgb([28, 32, 48]),           // dark blue-grey (video)
        "music" => Rgb([32, 28, 48]),            // dark purple (audio)
        "photos" => Rgb([28, 40, 28]),           // dark green (images)
        _ => Rgb([36, 36, 36]),                  // neutral dark
    };

    // Accent colour for the icon indicator
    let accent: Rgb<u8> = match category {
        "movies" => Rgb([70, 100, 180]),
        "music" => Rgb([100, 70, 180]),
        "photos" => Rgb([70, 160, 80]),
        _ => Rgb([100, 100, 100]),
    };

    let mut img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(W, H, bg);

    // Draw a simple 60×60 icon shape centred at (160, 160)
    // For all categories: draw a rounded-ish diamond as a placeholder symbol
    let cx = (W / 2) as i32;
    let cy = (H / 2) as i32;

    // Outer ring (3 px wide circle)
    for y in 0..H {
        for x in 0..W {
            let dx = x as i32 - cx;
            let dy = y as i32 - cy;
            let dist_sq = dx * dx + dy * dy;
            let r_outer = 55i32;
            let r_inner = 48i32;

            if dist_sq <= r_outer * r_outer && dist_sq >= r_inner * r_inner {
                img.put_pixel(x, y, accent);
            }

            // Category-specific inner icon
            match category {
                // Play triangle for video
                "movies" => {
                    if dy >= -24 && dy <= 24 && dx >= -18 && dx <= 22 {
                        let half = (24 - dy.abs()) as i32;
                        if dx >= -18 && dx <= half - 2 {
                            img.put_pixel(x, y, accent);
                        }
                    }
                }
                // Music note bars
                "music" => {
                    // Two vertical bars
                    if (dx >= -14 && dx <= -6 && dy >= -12 && dy <= 20)
            || (dx >= 6 && dx <= 14 && dy >= -20 && dy <= 12)
            // Connecting beam
            || (dy >= -22 && dy <= -14 && dx >= -14 && dx <= 14)
                    {
                        img.put_pixel(x, y, accent);
                    }
                }
                // Mountain / landscape icon for photos
                "photos" => {
                    // Two triangular peaks
                    let mountain = (dx.abs() + dy).abs();
                    if dy >= -8 && dy <= 20 && mountain < 30 {
                        img.put_pixel(x, y, accent);
                    }
                }
                // Dots for generic drive files
                _ => {
                    let dot_positions: [(i32, i32); 3] = [(-20, 0), (0, 0), (20, 0)];
                    for (ox, oy) in dot_positions {
                        let ddx = dx - ox;
                        let ddy = dy - oy;
                        if ddx * ddx + ddy * ddy <= 36 {
                            img.put_pixel(x, y, accent);
                        }
                    }
                }
            }
        }
    }

    img.save(output)
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))
}

// ── Orphan cleanup helper ─────────────────────────────────────────────────────

/// List all thumbnail file stems (without `.jpg` extension) in `cache/thumbnails/`.
/// Used by the cleanup job to find orphaned files.
pub fn list_thumbnail_ids(root: &Path) -> Vec<String> {
    let dir = cache::thumbnails_dir(root);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut ids = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("jpg") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                ids.push(stem.to_string());
            }
        }
    }
    ids
}

/// Delete a thumbnail file for the given media ID if it exists.
pub fn delete_thumbnail(root: &Path, media_id: &str) {
    let path = cache::thumbnails_dir(root).join(format!("{media_id}.jpg"));
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
}
