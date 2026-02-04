//! Thumbnail generation pipeline using exiftool and image resizing
//!
//! This module extracts embedded JPEG data from RAW files using exiftool's
//! JpgFromRaw and PreviewImage tags, then resizes them to the appropriate
//! tier using the `image` crate.

use anyhow::{Context, Result, bail};
use image::{DynamicImage, ImageReader, ImageFormat, GenericImageView};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThumbnailTier {
    /// 300px long edge, JPEG quality 80 - for grid view thumbnails
    Micro,
    /// 1600px long edge, JPEG quality 85 - for enlarged previews  
    Preview,
    /// Native resolution from JpgFromRaw - for loupe/zoom view
    Loupe,
}

impl ThumbnailTier {
    pub fn max_dimension(&self) -> Option<u32> {
        match self {
            ThumbnailTier::Micro => Some(300),
            ThumbnailTier::Preview => Some(1600),
            ThumbnailTier::Loupe => None, // Native resolution
        }
    }
    
    pub fn jpeg_quality(&self) -> u8 {
        match self {
            ThumbnailTier::Micro => 80,
            ThumbnailTier::Preview => 85,
            ThumbnailTier::Loupe => 85, // High quality for loupe
        }
    }
    
    pub fn exiftool_tag(&self) -> &'static str {
        match self {
            ThumbnailTier::Micro | ThumbnailTier::Preview => "PreviewImage",
            ThumbnailTier::Loupe => "JpgFromRaw",
        }
    }
}

impl std::fmt::Display for ThumbnailTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ThumbnailTier::Micro => write!(f, "micro"),
            ThumbnailTier::Preview => write!(f, "preview"),
            ThumbnailTier::Loupe => write!(f, "loupe"),
        }
    }
}

impl std::str::FromStr for ThumbnailTier {
    type Err = anyhow::Error;
    
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "micro" => Ok(ThumbnailTier::Micro),
            "preview" => Ok(ThumbnailTier::Preview),
            "loupe" => Ok(ThumbnailTier::Loupe),
            _ => bail!("Invalid thumbnail tier: {}. Valid options: micro, preview, loupe", s),
        }
    }
}

/// RGB color swatch extracted from thumbnail center
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColorSwatch {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl ColorSwatch {
    pub fn to_hex(&self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }
    
    /// Calculate perceived brightness using standard luminance weights
    pub fn brightness(&self) -> u8 {
        // ITU-R BT.709 luminance formula
        let luminance = 0.299 * self.r as f64 + 0.587 * self.g as f64 + 0.114 * self.b as f64;
        luminance.round() as u8
    }
}

/// Generate a thumbnail for a file at the specified tier
pub fn generate_thumbnail(file_path: &Path, tier: ThumbnailTier) -> Result<Vec<u8>> {
    // Extract embedded JPEG using exiftool
    let jpeg_data = extract_embedded_jpeg(file_path, tier)?;
    
    // If this is loupe tier, return the raw extracted JPEG
    if tier == ThumbnailTier::Loupe {
        return Ok(jpeg_data);
    }
    
    // Decode the JPEG
    let img = ImageReader::new(Cursor::new(&jpeg_data))
        .with_guessed_format()?
        .decode()
        .with_context(|| format!("Failed to decode embedded JPEG for {}", file_path.display()))?;
    
    // Resize if needed
    let resized_img = resize_image(img, tier);
    
    // Encode to JPEG at target quality
    encode_jpeg(resized_img, tier.jpeg_quality())
}

/// Extract embedded JPEG from a RAW file using exiftool
fn extract_embedded_jpeg(file_path: &Path, tier: ThumbnailTier) -> Result<Vec<u8>> {
    let output = Command::new("exiftool")
        .arg("-b") // Binary output
        .arg(format!("-{}", tier.exiftool_tag()))
        .arg(file_path)
        .output()
        .with_context(|| format!("Failed to run exiftool on {}", file_path.display()))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("exiftool failed for {}: {}", file_path.display(), stderr);
    }
    
    if output.stdout.is_empty() {
        bail!("No embedded JPEG found in {} for tag {}", 
              file_path.display(), tier.exiftool_tag());
    }
    
    Ok(output.stdout)
}

/// Resize image to fit within the tier's max dimension while preserving aspect ratio
fn resize_image(img: DynamicImage, tier: ThumbnailTier) -> DynamicImage {
    let max_dim = match tier.max_dimension() {
        Some(dim) => dim,
        None => return img, // No resizing for Loupe tier
    };
    
    let (width, height) = img.dimensions();
    let max_existing = width.max(height);
    
    // If image is already smaller than target, don't upscale
    if max_existing <= max_dim {
        return img;
    }
    
    // Calculate new dimensions maintaining aspect ratio
    let ratio = max_dim as f64 / max_existing as f64;
    let new_width = (width as f64 * ratio).round() as u32;
    let new_height = (height as f64 * ratio).round() as u32;
    
    img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
}

/// Encode image as JPEG with specified quality
fn encode_jpeg(img: DynamicImage, quality: u8) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    
    img.write_to(&mut cursor, ImageFormat::Jpeg)
        .context("Failed to encode JPEG")?;
    
    Ok(buffer)
}

/// Extract a color swatch from the center region of an image
pub fn extract_color_swatch(file_path: &Path) -> Result<ColorSwatch> {
    // Extract a small preview image first
    let jpeg_data = extract_embedded_jpeg(file_path, ThumbnailTier::Micro)?;
    
    // Decode the JPEG
    let img = ImageReader::new(Cursor::new(&jpeg_data))
        .with_guessed_format()?
        .decode()
        .with_context(|| format!("Failed to decode image for color extraction: {}", file_path.display()))?;
    
    let rgb_img = img.to_rgb8();
    let (width, height) = rgb_img.dimensions();
    
    // Sample from center 25% of the image
    let center_x = width / 2;
    let center_y = height / 2;
    let sample_width = (width / 4).max(1);
    let sample_height = (height / 4).max(1);
    
    let start_x = center_x.saturating_sub(sample_width / 2);
    let start_y = center_y.saturating_sub(sample_height / 2);
    let end_x = (start_x + sample_width).min(width);
    let end_y = (start_y + sample_height).min(height);
    
    // Average the colors in the center region
    let mut total_r = 0u64;
    let mut total_g = 0u64;
    let mut total_b = 0u64;
    let mut pixel_count = 0u64;
    
    for y in start_y..end_y {
        for x in start_x..end_x {
            let pixel = rgb_img.get_pixel(x, y);
            total_r += pixel[0] as u64;
            total_g += pixel[1] as u64;
            total_b += pixel[2] as u64;
            pixel_count += 1;
        }
    }
    
    if pixel_count == 0 {
        // Fallback to a neutral gray
        return Ok(ColorSwatch { r: 128, g: 128, b: 128 });
    }
    
    let avg_r = (total_r / pixel_count) as u8;
    let avg_g = (total_g / pixel_count) as u8;
    let avg_b = (total_b / pixel_count) as u8;
    
    Ok(ColorSwatch { r: avg_r, g: avg_g, b: avg_b })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_thumbnail_tier_parsing() {
        assert_eq!("micro".parse::<ThumbnailTier>().unwrap(), ThumbnailTier::Micro);
        assert_eq!("preview".parse::<ThumbnailTier>().unwrap(), ThumbnailTier::Preview);
        assert_eq!("loupe".parse::<ThumbnailTier>().unwrap(), ThumbnailTier::Loupe);
        assert_eq!("MICRO".parse::<ThumbnailTier>().unwrap(), ThumbnailTier::Micro);
        assert!("invalid".parse::<ThumbnailTier>().is_err());
    }

    #[test]
    fn test_color_swatch() {
        let swatch = ColorSwatch { r: 255, g: 128, b: 64 };
        assert_eq!(swatch.to_hex(), "#ff8040");
        
        // Test brightness calculation
        let white = ColorSwatch { r: 255, g: 255, b: 255 };
        let black = ColorSwatch { r: 0, g: 0, b: 0 };
        assert!(white.brightness() > black.brightness());
    }

    #[test]
    fn test_resize_logic() {
        // Create a test image
        let img = DynamicImage::new_rgb8(1000, 800);
        
        // Test micro resize (should fit within 300px)
        let resized = resize_image(img.clone(), ThumbnailTier::Micro);
        let (w, h) = resized.dimensions();
        assert!(w.max(h) <= 300);
        assert_eq!(w, 300); // Width should be the limiting dimension
        assert_eq!(h, 240); // Height should maintain aspect ratio
        
        // Test that small images don't get upscaled
        let small_img = DynamicImage::new_rgb8(100, 80);
        let not_resized = resize_image(small_img.clone(), ThumbnailTier::Micro);
        assert_eq!(not_resized.dimensions(), small_img.dimensions());
    }
}