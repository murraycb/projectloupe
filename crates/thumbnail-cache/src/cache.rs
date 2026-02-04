//! Main cache manager that coordinates memory and disk caching
//!
//! This module provides the primary ThumbnailCache interface that manages
//! both in-memory LRU caches and persistent disk storage for thumbnails
//! across different tiers (Micro, Preview, Loupe).

use crate::generate::{ThumbnailTier, generate_thumbnail, extract_color_swatch, ColorSwatch};
use crate::lru::LruCache;
use crate::{ThumbnailConfig, generate_cache_key};
use anyhow::{Context, Result, bail};
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Main thumbnail cache manager
pub struct ThumbnailCache {
    session_hash: String,
    cache_dir: PathBuf,
    config: ThumbnailConfig,
    micro_cache: Arc<LruCache<String, Vec<u8>>>,
    preview_cache: Arc<LruCache<String, Vec<u8>>>,
    loupe_cache: Arc<LruCache<String, Vec<u8>>>,
}

impl ThumbnailCache {
    /// Create a new thumbnail cache for the given session
    pub fn new(session_hash: &str) -> Result<Self> {
        Self::with_config(session_hash, ThumbnailConfig::default())
    }

    /// Create a new thumbnail cache with custom configuration
    pub fn with_config(session_hash: &str, config: ThumbnailConfig) -> Result<Self> {
        let cache_dir = Self::get_cache_dir(session_hash)?;
        fs::create_dir_all(&cache_dir)
            .with_context(|| format!("Failed to create cache directory: {}", cache_dir.display()))?;

        // Create subdirectories for each tier
        for tier in [ThumbnailTier::Micro, ThumbnailTier::Preview, ThumbnailTier::Loupe] {
            let tier_dir = cache_dir.join(tier.to_string());
            fs::create_dir_all(&tier_dir)
                .with_context(|| format!("Failed to create {} cache directory", tier))?;
        }

        let micro_cache = Arc::new(LruCache::new(config.micro_memory_budget));
        let preview_cache = Arc::new(LruCache::new(config.preview_memory_budget));
        let loupe_cache = Arc::new(LruCache::new(config.loupe_memory_budget));

        Ok(Self {
            session_hash: session_hash.to_string(),
            cache_dir,
            config,
            micro_cache,
            preview_cache,
            loupe_cache,
        })
    }

    /// Get cache directory for a session
    fn get_cache_dir(session_hash: &str) -> Result<PathBuf> {
        let home_dir = dirs::home_dir()
            .context("Unable to find home directory")?;
        Ok(home_dir.join(".projectloupe").join("cache").join(session_hash))
    }

    /// Get the LRU cache for a specific tier
    fn get_memory_cache(&self, tier: ThumbnailTier) -> &Arc<LruCache<String, Vec<u8>>> {
        match tier {
            ThumbnailTier::Micro => &self.micro_cache,
            ThumbnailTier::Preview => &self.preview_cache,
            ThumbnailTier::Loupe => &self.loupe_cache,
        }
    }

    /// Get the disk cache path for a file hash and tier
    fn get_disk_cache_path(&self, file_hash: &str, tier: ThumbnailTier) -> PathBuf {
        self.cache_dir.join(tier.to_string()).join(format!("{}.jpg", file_hash))
    }

    /// Get a thumbnail from cache (memory first, then disk)
    pub fn get(&self, file_hash: &str, tier: ThumbnailTier) -> Option<Vec<u8>> {
        // Check memory cache first
        let memory_cache = self.get_memory_cache(tier);
        if let Some(data) = memory_cache.get(file_hash) {
            return Some(data);
        }

        // Check disk cache
        let disk_path = self.get_disk_cache_path(file_hash, tier);
        if let Ok(data) = fs::read(&disk_path) {
            // Populate memory cache
            memory_cache.insert(file_hash.to_string(), data.clone(), data.len());
            return Some(data);
        }

        None
    }

    /// Get a thumbnail, generating it if not cached
    pub fn get_or_generate(&self, file_path: &str, tier: ThumbnailTier) -> Result<Vec<u8>> {
        let path = Path::new(file_path);
        if !path.exists() {
            bail!("File does not exist: {}", file_path);
        }

        let file_hash = generate_cache_key(path)?;

        // Try to get from cache first
        if let Some(data) = self.get(&file_hash, tier) {
            return Ok(data);
        }

        // Generate thumbnail
        let data = generate_thumbnail(path, tier)
            .with_context(|| format!("Failed to generate {} thumbnail for {}", tier, file_path))?;

        // Cache the result
        self.store(&file_hash, tier, &data)?;

        Ok(data)
    }

    /// Store thumbnail data in both memory and disk cache
    fn store(&self, file_hash: &str, tier: ThumbnailTier, data: &[u8]) -> Result<()> {
        // Store in memory cache
        let memory_cache = self.get_memory_cache(tier);
        memory_cache.insert(file_hash.to_string(), data.to_vec(), data.len());

        // Store on disk
        let disk_path = self.get_disk_cache_path(file_hash, tier);
        fs::write(&disk_path, data)
            .with_context(|| format!("Failed to write cache file: {}", disk_path.display()))?;

        Ok(())
    }

    /// Generate thumbnails for multiple files in parallel
    pub fn generate_batch<F>(
        &self, 
        file_paths: &[String], 
        tier: ThumbnailTier, 
        progress_callback: F
    ) -> Result<HashMap<String, Result<String>>>
    where
        F: Fn(usize, usize) + Send + Sync,
    {
        let progress_callback = Arc::new(progress_callback);
        let total = file_paths.len();
        let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));

        let results: Vec<(String, Result<String>)> = file_paths
            .par_iter()
            .map(|file_path| {
                let result = (|| -> Result<String> {
                    let path = Path::new(file_path);
                    let file_hash = generate_cache_key(path)?;

                    // Check if already cached
                    if let Some(_) = self.get(&file_hash, tier) {
                        return Ok(self.get_disk_cache_path(&file_hash, tier).to_string_lossy().to_string());
                    }

                    // Generate thumbnail
                    let data = generate_thumbnail(path, tier)?;
                    self.store(&file_hash, tier, &data)?;

                    Ok(self.get_disk_cache_path(&file_hash, tier).to_string_lossy().to_string())
                })();

                // Update progress
                let current = completed.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                progress_callback(current, total);

                (file_path.clone(), result)
            })
            .collect();

        Ok(results.into_iter().collect())
    }

    /// Extract color swatches for multiple files in parallel
    pub fn get_color_swatches(&self, file_paths: &[String]) -> Result<HashMap<String, ColorSwatch>> {
        let results: Vec<(String, Result<ColorSwatch>)> = file_paths
            .par_iter()
            .map(|file_path| {
                let result = extract_color_swatch(Path::new(file_path));
                (file_path.clone(), result)
            })
            .collect();

        let mut swatches = HashMap::new();
        for (file_path, result) in results {
            match result {
                Ok(swatch) => {
                    swatches.insert(file_path, swatch);
                }
                Err(e) => {
                    eprintln!("Failed to extract color swatch for {}: {}", file_path, e);
                    // Use a default gray swatch for failed extractions
                    swatches.insert(file_path, ColorSwatch { r: 128, g: 128, b: 128 });
                }
            }
        }

        Ok(swatches)
    }

    /// Get cache statistics
    pub fn cache_stats(&self) -> CacheStats {
        CacheStats {
            micro_items: self.micro_cache.len(),
            micro_bytes: self.micro_cache.total_bytes(),
            micro_max_bytes: self.micro_cache.max_bytes(),
            preview_items: self.preview_cache.len(),
            preview_bytes: self.preview_cache.total_bytes(),
            preview_max_bytes: self.preview_cache.max_bytes(),
            loupe_items: self.loupe_cache.len(),
            loupe_bytes: self.loupe_cache.total_bytes(),
            loupe_max_bytes: self.loupe_cache.max_bytes(),
        }
    }

    /// Clear all caches (memory and disk)
    pub fn clear_all(&self) -> Result<()> {
        // Clear memory caches
        self.micro_cache.clear();
        self.preview_cache.clear();
        self.loupe_cache.clear();

        // Clear disk cache
        if self.cache_dir.exists() {
            fs::remove_dir_all(&self.cache_dir)
                .with_context(|| format!("Failed to remove cache directory: {}", self.cache_dir.display()))?;
            fs::create_dir_all(&self.cache_dir)
                .with_context(|| format!("Failed to recreate cache directory: {}", self.cache_dir.display()))?;

            // Recreate subdirectories
            for tier in [ThumbnailTier::Micro, ThumbnailTier::Preview, ThumbnailTier::Loupe] {
                let tier_dir = self.cache_dir.join(tier.to_string());
                fs::create_dir_all(&tier_dir)?;
            }
        }

        Ok(())
    }
}

/// Cache statistics for monitoring and debugging
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub micro_items: usize,
    pub micro_bytes: usize,
    pub micro_max_bytes: usize,
    pub preview_items: usize,
    pub preview_bytes: usize,
    pub preview_max_bytes: usize,
    pub loupe_items: usize,
    pub loupe_bytes: usize,
    pub loupe_max_bytes: usize,
}

impl CacheStats {
    pub fn total_items(&self) -> usize {
        self.micro_items + self.preview_items + self.loupe_items
    }

    pub fn total_bytes(&self) -> usize {
        self.micro_bytes + self.preview_bytes + self.loupe_bytes
    }

    pub fn total_max_bytes(&self) -> usize {
        self.micro_max_bytes + self.preview_max_bytes + self.loupe_max_bytes
    }

    pub fn memory_usage_percent(&self) -> f64 {
        if self.total_max_bytes() == 0 {
            0.0
        } else {
            (self.total_bytes() as f64 / self.total_max_bytes() as f64) * 100.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn test_cache_creation() -> Result<()> {
        let temp_dir = tempdir()?;
        let session_hash = "test_session";
        
        let cache = ThumbnailCache::new(session_hash)?;
        
        // Check that cache directories were created
        let cache_dir = cache.cache_dir;
        assert!(cache_dir.exists());
        assert!(cache_dir.join("micro").exists());
        assert!(cache_dir.join("preview").exists());
        assert!(cache_dir.join("loupe").exists());

        Ok(())
    }

    #[test]
    fn test_cache_key_generation_and_paths() -> Result<()> {
        let temp_dir = tempdir()?;
        let file_path = temp_dir.path().join("test.jpg");
        fs::write(&file_path, b"fake jpeg content")?;

        let cache = ThumbnailCache::new("test")?;
        let file_hash = generate_cache_key(&file_path)?;

        let micro_path = cache.get_disk_cache_path(&file_hash, ThumbnailTier::Micro);
        assert!(micro_path.to_string_lossy().contains("micro"));
        assert!(micro_path.to_string_lossy().ends_with(".jpg"));

        let preview_path = cache.get_disk_cache_path(&file_hash, ThumbnailTier::Preview);
        assert!(preview_path.to_string_lossy().contains("preview"));

        let loupe_path = cache.get_disk_cache_path(&file_hash, ThumbnailTier::Loupe);
        assert!(loupe_path.to_string_lossy().contains("loupe"));

        Ok(())
    }

    #[test]
    fn test_cache_stats() -> Result<()> {
        let cache = ThumbnailCache::new("test_stats")?;
        let stats = cache.cache_stats();

        assert_eq!(stats.total_items(), 0);
        assert_eq!(stats.total_bytes(), 0);
        assert!(stats.total_max_bytes() > 0);
        assert_eq!(stats.memory_usage_percent(), 0.0);

        Ok(())
    }

    #[test]
    fn test_memory_cache_store_and_retrieve() {
        let cache = ThumbnailCache::new("test_memory").unwrap();
        
        // Store directly in memory cache
        let test_data = vec![1, 2, 3, 4, 5];
        cache.micro_cache.insert("test_hash".to_string(), test_data.clone(), test_data.len());
        
        // Retrieve from memory cache
        let retrieved = cache.get("test_hash", ThumbnailTier::Micro);
        assert_eq!(retrieved, Some(test_data));
        
        // Check stats
        let stats = cache.cache_stats();
        assert_eq!(stats.micro_items, 1);
        assert_eq!(stats.micro_bytes, 5);
    }
}