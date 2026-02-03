//! Image metadata extraction and management for ProjectLoupe

use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use anyhow::{Result, Context};
use crate::quality::QualityScore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub capture_time: DateTime<Utc>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub path: PathBuf,
    pub metadata: ImageMetadata,
    pub quality_score: Option<QualityScore>,
}

impl ImageInfo {
    /// Extract metadata from an image file
    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let metadata = extract_metadata(&path)?;
        
        Ok(Self {
            path,
            metadata,
            quality_score: None,
        })
    }
    
    /// Get the filename without extension
    pub fn filename_stem(&self) -> Option<&str> {
        self.path.file_stem()?.to_str()
    }
    
    /// Get the file extension
    pub fn extension(&self) -> Option<&str> {
        self.path.extension()?.to_str()
    }
    
    /// Check if this is a RAW file based on extension
    pub fn is_raw(&self) -> bool {
        match self.extension() {
            Some(ext) => matches!(
                ext.to_lowercase().as_str(),
                "cr3" | "cr2" | "nef" | "arw" | "raf" | "dng" | "rw2" | "orf"
            ),
            None => false,
        }
    }
    
    /// Check if this is a JPEG file
    pub fn is_jpeg(&self) -> bool {
        match self.extension() {
            Some(ext) => matches!(ext.to_lowercase().as_str(), "jpg" | "jpeg"),
            None => false,
        }
    }
}

/// Extract EXIF metadata from an image file
fn extract_metadata(path: &Path) -> Result<ImageMetadata> {
    // For now, use file modification time as capture time
    // TODO: Implement proper EXIF parsing with rexif
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("Failed to get file metadata: {}", path.display()))?;
    
    let capture_time = metadata.modified()
        .map(DateTime::from)
        .unwrap_or_else(|_| Utc::now());
    
    let file_size = metadata.len();
    
    // Extract basic info from filename for now
    let filename = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    
    Ok(ImageMetadata {
        capture_time,
        camera_make: Some("Unknown".to_string()),
        camera_model: Some("Unknown".to_string()),
        lens_model: None,
        focal_length: None,
        aperture: None,
        shutter_speed: None,
        iso: None,
        file_size,
    })
}

// TODO: Implement proper EXIF parsing with rexif
// For now, using file metadata as placeholder

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_placeholder_functionality() {
        // TODO: Add EXIF parsing tests when rexif implementation is complete
        assert!(true);
    }
    
    #[test]
    fn test_file_type_detection() {
        let raw_info = ImageInfo {
            path: PathBuf::from("test.cr3"),
            metadata: ImageMetadata {
                capture_time: Utc::now(),
                camera_make: None,
                camera_model: None,
                lens_model: None,
                focal_length: None,
                aperture: None,
                shutter_speed: None,
                iso: None,
                file_size: 0,
            },
            quality_score: None,
        };
        
        assert!(raw_info.is_raw());
        assert!(!raw_info.is_jpeg());
        
        let jpeg_info = ImageInfo {
            path: PathBuf::from("test.jpg"),
            metadata: raw_info.metadata.clone(),
            quality_score: None,
        };
        
        assert!(!jpeg_info.is_raw());
        assert!(jpeg_info.is_jpeg());
    }
}