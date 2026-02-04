//! High-performance thumbnail generation and caching library for ProjectLoupe
//!
//! This crate provides a complete pipeline for extracting embedded JPEGs from RAW files,
//! resizing them to configurable tiers (Micro, Preview, Loupe), and caching both in
//! memory (LRU) and on disk. Designed for fast grid view and smooth zooming in photo
//! organization applications.
//!
//! # Features
//!
//! - **Multi-tier thumbnails**: Micro (300px), Preview (1600px), Loupe (native resolution)
//! - **Dual caching**: In-memory LRU with byte budgets + persistent disk cache
//! - **Parallel generation**: Batch processing with rayon for high throughput
//! - **Smart prefetching**: Viewport-aware scheduling with cancellation
//! - **Color extraction**: Dominant color swatches for placeholder backgrounds
//! - **RAW file support**: Leverages exiftool's JpgFromRaw and PreviewImage extraction

pub mod cache;
pub mod generate;
pub mod lru;
pub mod prefetch;

pub use cache::ThumbnailCache;
pub use generate::{ThumbnailTier, ColorSwatch, generate_thumbnail, extract_color_swatch};
pub use lru::LruCache;
pub use prefetch::PrefetchScheduler;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Standard configuration for thumbnail generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailConfig {
    pub micro_size: u32,
    pub preview_size: u32,
    pub micro_quality: u8,
    pub preview_quality: u8,
    pub micro_memory_budget: usize,
    pub preview_memory_budget: usize,
    pub loupe_memory_budget: usize,
}

impl Default for ThumbnailConfig {
    fn default() -> Self {
        Self {
            micro_size: 300,
            preview_size: 1600,
            micro_quality: 80,
            preview_quality: 85,
            micro_memory_budget: 150 * 1024 * 1024,   // 150MB
            preview_memory_budget: 200 * 1024 * 1024, // 200MB
            loupe_memory_budget: 100 * 1024 * 1024,   // 100MB
        }
    }
}

/// Generate a cache key for a file based on its path, size, and modification time
pub fn generate_cache_key(file_path: &Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::fs;

    let metadata = fs::metadata(file_path)?;
    let absolute_path = file_path.canonicalize()?.to_string_lossy().to_string();
    let file_size = metadata.len();
    let modified_time = metadata.modified()?
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis();

    let mut hasher = Sha256::new();
    hasher.update(absolute_path.as_bytes());
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&modified_time.to_le_bytes());
    
    let result = hasher.finalize();
    // Use first 16 bytes (32 hex chars) for a compact but collision-resistant key
    Ok(hex::encode(&result[..16]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_cache_key_generation() -> Result<()> {
        let temp_dir = tempdir()?;
        let file_path = temp_dir.path().join("test.jpg");
        fs::write(&file_path, b"test content")?;

        let key1 = generate_cache_key(&file_path)?;
        let key2 = generate_cache_key(&file_path)?;
        
        // Same file should generate same key
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 32); // 16 bytes as hex = 32 chars
        
        // Different files should generate different keys
        let file2_path = temp_dir.path().join("test2.jpg");
        fs::write(&file2_path, b"different content")?;
        let key3 = generate_cache_key(&file2_path)?;
        assert_ne!(key1, key3);

        Ok(())
    }

    #[test]
    fn test_cache_key_changes_with_modification() -> Result<()> {
        let temp_dir = tempdir()?;
        let file_path = temp_dir.path().join("test.jpg");
        fs::write(&file_path, b"test content")?;

        let key1 = generate_cache_key(&file_path)?;
        
        // Sleep briefly and modify file
        std::thread::sleep(std::time::Duration::from_millis(10));
        fs::write(&file_path, b"modified content")?;
        let key2 = generate_cache_key(&file_path)?;
        
        // Key should change when file is modified
        assert_ne!(key1, key2);
        Ok(())
    }
}