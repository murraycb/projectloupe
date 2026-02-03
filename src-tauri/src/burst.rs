//! Burst detection and grouping for ProjectLoupe
//! 
//! This module implements the core MVP feature: auto-detecting burst sequences
//! from EXIF timing data and providing AI-powered best-pick suggestions.

use std::path::Path;
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use anyhow::{Result, Context};
use crate::image_info::ImageInfo;
use crate::quality::QualityScore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstConfig {
    /// Maximum time gap between consecutive shots to consider them part of the same burst (milliseconds)
    pub max_gap_ms: i64,
    /// Minimum number of shots to constitute a burst
    pub min_burst_size: usize,
    /// Maximum number of shots in a single burst before splitting
    pub max_burst_size: usize,
}

impl Default for BurstConfig {
    fn default() -> Self {
        Self {
            // Based on typical camera burst rates:
            // - High-end bodies: 10-20 fps (50-100ms gaps)
            // - Mid-range: 5-10 fps (100-200ms gaps)
            // - We use 2 seconds as a safe upper bound for manual trigger gaps
            max_gap_ms: 2000,
            min_burst_size: 3,
            max_burst_size: 200, // Prevent massive groups from long sequences
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstGroup {
    /// Unique identifier for this burst group
    pub id: String,
    /// Images in this burst, sorted by capture time
    pub images: Vec<ImageInfo>,
    /// Suggested best pick (index into images array)
    pub best_pick_index: Option<usize>,
    /// Average time gap between consecutive shots (ms)
    pub avg_gap_ms: f64,
    /// Duration of the entire burst sequence
    pub duration_ms: i64,
    /// Quality-based ranking of all images in the burst
    pub quality_ranking: Vec<usize>, // indices sorted by quality score
}

impl BurstGroup {
    /// Get the best pick image, if available
    pub fn best_pick(&self) -> Option<&ImageInfo> {
        self.best_pick_index.and_then(|idx| self.images.get(idx))
    }
    
    /// Get images ranked by quality (best first)
    pub fn ranked_by_quality(&self) -> Vec<&ImageInfo> {
        self.quality_ranking
            .iter()
            .filter_map(|&idx| self.images.get(idx))
            .collect()
    }
    
    /// Calculate statistics for this burst
    pub fn stats(&self) -> BurstStats {
        let count = self.images.len();
        let duration = self.duration_ms;
        let avg_fps = if duration > 0 { 
            (count as f64 * 1000.0) / duration as f64 
        } else { 
            0.0 
        };
        
        BurstStats {
            image_count: count,
            duration_ms: duration,
            avg_gap_ms: self.avg_gap_ms,
            avg_fps,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BurstStats {
    pub image_count: usize,
    pub duration_ms: i64,
    pub avg_gap_ms: f64,
    pub avg_fps: f64,
}

pub struct BurstDetector {
    config: BurstConfig,
}

impl BurstDetector {
    pub fn new(config: BurstConfig) -> Self {
        Self { config }
    }
    
    pub fn with_default_config() -> Self {
        Self::new(BurstConfig::default())
    }
    
    /// Detect burst groups from a collection of images
    pub fn detect_bursts(&self, mut images: Vec<ImageInfo>) -> Result<Vec<BurstGroup>> {
        if images.is_empty() {
            return Ok(Vec::new());
        }
        
        // Sort by capture time
        images.sort_by_key(|img| img.metadata.capture_time);
        
        let mut groups = Vec::new();
        let mut current_group: Vec<ImageInfo> = Vec::new();
        let mut group_id_counter = 0;
        
        for image in images {
            if let Some(last_image) = current_group.last() {
                let time_gap = image.metadata.capture_time
                    .signed_duration_since(last_image.metadata.capture_time)
                    .num_milliseconds();
                
                // Check if this image starts a new burst
                if time_gap > self.config.max_gap_ms || 
                   current_group.len() >= self.config.max_burst_size {
                    // Finalize current group if it qualifies as a burst
                    if current_group.len() >= self.config.min_burst_size {
                        let burst_group = self.create_burst_group(
                            format!("burst_{}", group_id_counter),
                            current_group.clone(),
                        )?;
                        groups.push(burst_group);
                        group_id_counter += 1;
                    } else {
                        // Add individual images as single-image "groups"
                        for img in current_group.drain(..) {
                            let single_group = self.create_burst_group(
                                format!("single_{}", group_id_counter),
                                vec![img],
                            )?;
                            groups.push(single_group);
                            group_id_counter += 1;
                        }
                    }
                    current_group.clear();
                }
            }
            
            current_group.push(image);
        }
        
        // Handle final group
        if !current_group.is_empty() {
            if current_group.len() >= self.config.min_burst_size {
                let burst_group = self.create_burst_group(
                    format!("burst_{}", group_id_counter),
                    current_group,
                )?;
                groups.push(burst_group);
            } else {
                // Add remaining individual images
                for img in current_group {
                    let single_group = self.create_burst_group(
                        format!("single_{}", group_id_counter),
                        vec![img],
                    )?;
                    groups.push(single_group);
                    group_id_counter += 1;
                }
            }
        }
        
        Ok(groups)
    }
    
    /// Create a BurstGroup from a list of images
    fn create_burst_group(&self, id: String, images: Vec<ImageInfo>) -> Result<BurstGroup> {
        if images.is_empty() {
            return Err(anyhow::anyhow!("Cannot create burst group from empty image list"));
        }
        
        let (avg_gap_ms, duration_ms) = if images.len() > 1 {
            let gaps: Vec<i64> = images
                .windows(2)
                .map(|pair| {
                    pair[1].metadata.capture_time
                        .signed_duration_since(pair[0].metadata.capture_time)
                        .num_milliseconds()
                })
                .collect();
            
            let avg_gap = gaps.iter().sum::<i64>() as f64 / gaps.len() as f64;
            let total_duration = images.last().unwrap().metadata.capture_time
                .signed_duration_since(images.first().unwrap().metadata.capture_time)
                .num_milliseconds();
            
            (avg_gap, total_duration)
        } else {
            (0.0, 0)
        };
        
        // Generate quality-based ranking
        let mut quality_ranking: Vec<(usize, f64)> = images
            .iter()
            .enumerate()
            .map(|(idx, img)| (idx, img.quality_score.map_or(0.0, |q| q.overall_score)))
            .collect();
        
        // Sort by quality score (highest first)
        quality_ranking.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        let quality_ranking: Vec<usize> = quality_ranking.into_iter().map(|(idx, _)| idx).collect();
        let best_pick_index = if images.len() > 1 { quality_ranking.first().copied() } else { None };
        
        Ok(BurstGroup {
            id,
            images,
            best_pick_index,
            avg_gap_ms,
            duration_ms,
            quality_ranking,
        })
    }
    
    /// Update burst groups with new quality scores
    pub fn update_quality_rankings(&self, groups: &mut [BurstGroup]) {
        for group in groups {
            if group.images.len() <= 1 {
                continue;
            }
            
            let mut quality_ranking: Vec<(usize, f64)> = group.images
                .iter()
                .enumerate()
                .map(|(idx, img)| (idx, img.quality_score.map_or(0.0, |q| q.overall_score)))
                .collect();
            
            quality_ranking.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            
            group.quality_ranking = quality_ranking.into_iter().map(|(idx, _)| idx).collect();
            group.best_pick_index = group.quality_ranking.first().copied();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use crate::image_info::{ImageMetadata, ImageInfo};
    use std::path::PathBuf;
    
    fn create_test_image(path: &str, timestamp_secs: i64) -> ImageInfo {
        ImageInfo {
            path: PathBuf::from(path),
            metadata: ImageMetadata {
                capture_time: Utc.timestamp_opt(timestamp_secs, 0).unwrap(),
                camera_make: Some("Canon".to_string()),
                camera_model: Some("EOS R5".to_string()),
                lens_model: None,
                focal_length: None,
                aperture: None,
                shutter_speed: None,
                iso: None,
                file_size: 25 * 1024 * 1024, // 25MB
            },
            quality_score: Some(QualityScore {
                overall_score: 0.8,
                sharpness: 0.8,
                exposure: 0.7,
                composition: 0.9,
                technical_quality: 0.8,
            }),
        }
    }
    
    #[test]
    fn test_single_burst_detection() {
        let detector = BurstDetector::with_default_config();
        
        // Create a burst: 5 images taken 100ms apart
        let base_time = 1640995200; // 2022-01-01 00:00:00 UTC
        let images = vec![
            create_test_image("img001.cr3", base_time),
            create_test_image("img002.cr3", base_time + 0), // Same second (100ms gap simulated)
            create_test_image("img003.cr3", base_time + 0),
            create_test_image("img004.cr3", base_time + 1),
            create_test_image("img005.cr3", base_time + 1),
        ];
        
        let groups = detector.detect_bursts(images).unwrap();
        
        assert_eq!(groups.len(), 1);
        let burst = &groups[0];
        assert_eq!(burst.images.len(), 5);
        assert!(burst.best_pick_index.is_some());
        assert_eq!(burst.quality_ranking.len(), 5);
    }
    
    #[test]
    fn test_multiple_bursts() {
        let detector = BurstDetector::with_default_config();
        
        let base_time = 1640995200;
        let images = vec![
            // First burst (3 images)
            create_test_image("img001.cr3", base_time),
            create_test_image("img002.cr3", base_time + 1),
            create_test_image("img003.cr3", base_time + 1),
            // Gap of 10 seconds
            // Second burst (4 images)  
            create_test_image("img004.cr3", base_time + 10),
            create_test_image("img005.cr3", base_time + 10),
            create_test_image("img006.cr3", base_time + 11),
            create_test_image("img007.cr3", base_time + 11),
        ];
        
        let groups = detector.detect_bursts(images).unwrap();
        
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].images.len(), 3);
        assert_eq!(groups[1].images.len(), 4);
    }
    
    #[test]
    fn test_no_burst_individual_images() {
        let detector = BurstDetector::with_default_config();
        
        let base_time = 1640995200;
        let images = vec![
            create_test_image("img001.cr3", base_time),
            create_test_image("img002.cr3", base_time + 10), // 10 second gap
            create_test_image("img003.cr3", base_time + 20), // Another 10 second gap
        ];
        
        let groups = detector.detect_bursts(images).unwrap();
        
        // Should create 3 individual groups since gaps are too large
        assert_eq!(groups.len(), 3);
        for group in &groups {
            assert_eq!(group.images.len(), 1);
            assert!(group.best_pick_index.is_none()); // No best pick for single images
        }
    }
    
    #[test]
    fn test_burst_stats() {
        let detector = BurstDetector::with_default_config();
        
        let base_time = 1640995200;
        let images = vec![
            create_test_image("img001.cr3", base_time),
            create_test_image("img002.cr3", base_time + 1),
            create_test_image("img003.cr3", base_time + 2),
            create_test_image("img004.cr3", base_time + 3),
            create_test_image("img005.cr3", base_time + 4),
        ];
        
        let groups = detector.detect_bursts(images).unwrap();
        let burst = &groups[0];
        let stats = burst.stats();
        
        assert_eq!(stats.image_count, 5);
        assert_eq!(stats.duration_ms, 4000); // 4 seconds total
        assert!(stats.avg_fps > 1.0 && stats.avg_fps < 2.0); // ~1.25 fps
    }
}