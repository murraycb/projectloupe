//! Burst detection and grouping for ProjectLoupe
//! 
//! This module implements burst detection based on camera serial number partitioning
//! and EXIF drive mode analysis for accurate burst identification.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use crate::exif::ExifData;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstGroup {
    /// Unique identifier for this burst group
    pub id: String,
    /// Camera serial number for this burst
    pub camera_serial: String,
    /// Images in this burst, sorted by capture time
    pub images: Vec<ExifData>,
    /// Number of frames in the burst
    pub frame_count: usize,
    /// Duration of the entire burst sequence (milliseconds)
    pub duration_ms: i64,
    /// Average gap between consecutive shots (milliseconds)
    pub avg_gap_ms: f64,
    /// Estimated frames per second
    pub estimated_fps: f64,
}

impl BurstGroup {
    /// Create a new burst group
    pub fn new(id: String, camera_serial: String, mut images: Vec<ExifData>) -> Self {
        // Sort images by capture time
        images.sort_by_key(|img| img.capture_time);
        
        let frame_count = images.len();
        let (duration_ms, avg_gap_ms, estimated_fps) = if frame_count > 1 {
            let first_time = images.first().unwrap().capture_time;
            let last_time = images.last().unwrap().capture_time;
            let duration = last_time.signed_duration_since(first_time).num_milliseconds();
            
            // Calculate gaps between consecutive images
            let gaps: Vec<i64> = images.windows(2)
                .map(|pair| {
                    pair[1].capture_time.signed_duration_since(pair[0].capture_time).num_milliseconds()
                })
                .collect();
            
            let avg_gap = if !gaps.is_empty() {
                gaps.iter().sum::<i64>() as f64 / gaps.len() as f64
            } else {
                0.0
            };
            
            let fps = if duration > 0 {
                ((frame_count - 1) as f64 * 1000.0) / duration as f64
            } else {
                0.0
            };
            
            (duration, avg_gap, fps)
        } else {
            (0, 0.0, 0.0)
        };
        
        Self {
            id,
            camera_serial,
            images,
            frame_count,
            duration_ms,
            avg_gap_ms,
            estimated_fps,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraInfo {
    /// Camera serial number
    pub serial: String,
    /// Camera make
    pub make: String,
    /// Camera model
    pub model: String,
    /// Total number of images from this camera
    pub image_count: usize,
    /// Number of burst groups from this camera
    pub burst_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstResult {
    /// Detected burst groups
    pub bursts: Vec<BurstGroup>,
    /// Single images (not part of any burst)
    pub singles: Vec<ExifData>,
    /// Camera information summary
    pub cameras: Vec<CameraInfo>,
}

impl BurstResult {
    /// Get total number of images processed
    pub fn total_images(&self) -> usize {
        self.bursts.iter().map(|b| b.frame_count).sum::<usize>() + self.singles.len()
    }
    
    /// Get total number of burst groups
    pub fn total_bursts(&self) -> usize {
        self.bursts.len()
    }
    
    /// Get camera information for a specific serial number
    pub fn camera_info(&self, serial: &str) -> Option<&CameraInfo> {
        self.cameras.iter().find(|c| c.serial == serial)
    }
}

pub struct BurstDetector;

impl BurstDetector {
    /// Detect burst groups from a collection of images.
    ///
    /// Strategy hierarchy:
    /// 1. Camera-native BurstGroupID (e.g., Nikon) — ground truth
    /// 2. Drive mode inference — consecutive continuous-mode frames
    pub fn detect(images: Vec<ExifData>) -> Result<BurstResult> {
        if images.is_empty() {
            return Ok(BurstResult {
                bursts: Vec::new(),
                singles: Vec::new(),
                cameras: Vec::new(),
            });
        }

        // Check if any images have camera-native burst group IDs
        let has_native_burst_ids = images.iter().any(|img| img.burst_group_id.is_some());

        // Step 1: Partition images by camera serial number
        let mut camera_partitions: HashMap<String, Vec<ExifData>> = HashMap::new();
        for image in images {
            camera_partitions.entry(image.serial_number.clone())
                .or_default()
                .push(image);
        }

        let mut all_bursts = Vec::new();
        let mut all_singles = Vec::new();
        let mut cameras = Vec::new();
        let mut burst_id_counter = 0;
        let mut single_id_counter = 0;

        // Step 2: Process each camera partition independently
        for (serial, mut camera_images) in camera_partitions {
            // Sort by capture time within this camera
            camera_images.sort_by_key(|img| img.capture_time);
            
            // Extract camera info from the first image
            let camera_info = {
                let first_img = &camera_images[0];
                CameraInfo {
                    serial: serial.clone(),
                    make: first_img.make.clone().unwrap_or_else(|| "Unknown".to_string()),
                    model: first_img.model.clone().unwrap_or_else(|| "Unknown".to_string()),
                    image_count: camera_images.len(),
                    burst_count: 0,
                }
            };

            // Step 3: Detect bursts — choose strategy based on available data
            let camera_has_native_ids = camera_images.iter().any(|img| img.burst_group_id.is_some());
            
            let (camera_bursts, camera_singles) = if camera_has_native_ids {
                Self::detect_by_native_id(camera_images, &serial, &mut burst_id_counter)
            } else {
                Self::detect_by_drive_mode(camera_images, &serial, &mut burst_id_counter, &mut single_id_counter)
            };

            let mut camera_info = camera_info;
            camera_info.burst_count = camera_bursts.len();
            
            all_bursts.extend(camera_bursts);
            all_singles.extend(camera_singles);
            cameras.push(camera_info);
        }

        Ok(BurstResult {
            bursts: all_bursts,
            singles: all_singles,
            cameras,
        })
    }

    /// Strategy 1: Use camera-native BurstGroupID (Nikon, etc.)
    fn detect_by_native_id(
        images: Vec<ExifData>,
        camera_serial: &str,
        burst_id_counter: &mut usize,
    ) -> (Vec<BurstGroup>, Vec<ExifData>) {
        let mut bursts = Vec::new();
        let mut singles = Vec::new();

        // Group by native burst group ID
        let mut groups: HashMap<u64, Vec<ExifData>> = HashMap::new();
        let mut no_id: Vec<ExifData> = Vec::new();

        for image in images {
            if let Some(bg_id) = image.burst_group_id {
                groups.entry(bg_id).or_default().push(image);
            } else {
                no_id.push(image);
            }
        }

        // Convert groups to BurstGroups (only if >= 2 frames)
        for (_native_id, mut group_images) in groups {
            group_images.sort_by_key(|img| img.capture_time);

            if group_images.len() >= 2 {
                let burst = BurstGroup::new(
                    format!("burst_{}", burst_id_counter),
                    camera_serial.to_string(),
                    group_images,
                );
                bursts.push(burst);
                *burst_id_counter += 1;
            } else {
                // Single-frame "burst" (e.g., quick tap in continuous mode)
                singles.extend(group_images);
            }
        }

        singles.extend(no_id);

        // Sort bursts by first image timestamp for consistent ordering
        bursts.sort_by_key(|b| b.images.first().map(|img| img.capture_time));

        (bursts, singles)
    }

    /// Strategy 2: Infer bursts from consecutive continuous drive mode frames
    fn detect_by_drive_mode(
        images: Vec<ExifData>, 
        camera_serial: &str,
        burst_id_counter: &mut usize,
        _single_id_counter: &mut usize,
    ) -> (Vec<BurstGroup>, Vec<ExifData>) {
        let mut bursts = Vec::new();
        let mut singles = Vec::new();
        let mut current_burst: Vec<ExifData> = Vec::new();

        for image in images {
            let should_extend_burst = if let Some(last_image) = current_burst.last() {
                image.drive_mode.is_continuous() && last_image.drive_mode.is_continuous()
            } else {
                image.drive_mode.is_continuous()
            };

            if should_extend_burst {
                current_burst.push(image);
            } else {
                if current_burst.len() >= 2 {
                    let burst = BurstGroup::new(
                        format!("burst_{}", burst_id_counter),
                        camera_serial.to_string(),
                        current_burst.clone(),
                    );
                    bursts.push(burst);
                    *burst_id_counter += 1;
                } else {
                    for img in current_burst.drain(..) {
                        singles.push(img);
                    }
                }

                current_burst.clear();

                if image.drive_mode.is_continuous() {
                    current_burst.push(image);
                } else {
                    singles.push(image);
                }
            }
        }

        // Handle final burst
        if current_burst.len() >= 2 {
            let burst = BurstGroup::new(
                format!("burst_{}", burst_id_counter),
                camera_serial.to_string(),
                current_burst,
            );
            bursts.push(burst);
            *burst_id_counter += 1;
        } else {
            for img in current_burst {
                singles.push(img);
            }
        }

        (bursts, singles)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exif::{ExifData, DriveMode};
    use chrono::{Utc, TimeZone};
    use std::path::PathBuf;

    fn create_test_image(
        path: &str, 
        serial: &str, 
        drive_mode: DriveMode, 
        timestamp_secs: i64
    ) -> ExifData {
        ExifData::new(
            PathBuf::from(path),
            serial.to_string(),
            drive_mode,
            Utc.timestamp_opt(timestamp_secs, 0).unwrap(),
        )
    }

    fn create_test_image_with_burst_id(
        path: &str,
        serial: &str,
        drive_mode: DriveMode,
        timestamp_secs: i64,
        burst_id: u64,
    ) -> ExifData {
        let mut img = create_test_image(path, serial, drive_mode, timestamp_secs);
        img.burst_group_id = Some(burst_id);
        img
    }

    #[test]
    fn test_all_single_shot_images() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::Single, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::Single, 1005),
            create_test_image("img003.jpg", "camera1", DriveMode::Single, 1010),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 0);
        assert_eq!(result.singles.len(), 3);
        assert_eq!(result.cameras.len(), 1);
        assert_eq!(result.cameras[0].burst_count, 0);
    }

    #[test]
    fn test_continuous_sequence_single_burst() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1001),
            create_test_image("img003.jpg", "camera1", DriveMode::ContinuousHigh, 1002),
            create_test_image("img004.jpg", "camera1", DriveMode::ContinuousHigh, 1003),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 1);
        assert_eq!(result.singles.len(), 0);
        assert_eq!(result.bursts[0].frame_count, 4);
        assert_eq!(result.bursts[0].camera_serial, "camera1");
        assert!(result.bursts[0].estimated_fps > 0.0);
        assert_eq!(result.cameras[0].burst_count, 1);
    }

    #[test]
    fn test_mixed_single_continuous_split() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::Single, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1005),
            create_test_image("img003.jpg", "camera1", DriveMode::ContinuousHigh, 1006),
            create_test_image("img004.jpg", "camera1", DriveMode::ContinuousHigh, 1007),
            create_test_image("img005.jpg", "camera1", DriveMode::Single, 1015),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 1);
        assert_eq!(result.singles.len(), 2); // First and last image
        assert_eq!(result.bursts[0].frame_count, 3);
        assert_eq!(result.cameras[0].burst_count, 1);
    }

    #[test]
    fn test_two_camera_serials_independent() {
        let images = vec![
            // Camera 1 burst
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1001),
            create_test_image("img003.jpg", "camera1", DriveMode::ContinuousHigh, 1002),
            // Camera 2 burst
            create_test_image("img004.jpg", "camera2", DriveMode::ContinuousLow, 1005),
            create_test_image("img005.jpg", "camera2", DriveMode::ContinuousLow, 1006),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 2);
        assert_eq!(result.singles.len(), 0);
        assert_eq!(result.cameras.len(), 2);
        
        // Check that bursts are from different cameras
        let serials: Vec<&str> = result.bursts.iter().map(|b| b.camera_serial.as_str()).collect();
        assert!(serials.contains(&"camera1"));
        assert!(serials.contains(&"camera2"));
        
        // Each camera should have 1 burst
        for camera in &result.cameras {
            assert_eq!(camera.burst_count, 1);
        }
    }

    #[test]
    fn test_burst_stats_calculation() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1001),
            create_test_image("img003.jpg", "camera1", DriveMode::ContinuousHigh, 1002),
            create_test_image("img004.jpg", "camera1", DriveMode::ContinuousHigh, 1004), // 2 second gap
        ];

        let result = BurstDetector::detect(images).unwrap();
        let burst = &result.bursts[0];
        
        assert_eq!(burst.frame_count, 4);
        assert_eq!(burst.duration_ms, 4000); // 4 seconds total
        assert_eq!(burst.avg_gap_ms, (1000.0 + 1000.0 + 2000.0) / 3.0); // Average of gaps
        assert_eq!(burst.estimated_fps, 0.75); // 3 intervals in 4 seconds = 0.75 fps
    }

    #[test]
    fn test_minimum_burst_size_two_frames() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1001),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 1);
        assert_eq!(result.singles.len(), 0);
        assert_eq!(result.bursts[0].frame_count, 2);
    }

    #[test]
    fn test_single_continuous_frame_not_burst() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::Single, 1005),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.bursts.len(), 0);
        assert_eq!(result.singles.len(), 2);
    }

    #[test]
    fn test_native_burst_id_grouping() {
        let images = vec![
            create_test_image_with_burst_id("img001.jpg", "cam1", DriveMode::ContinuousHigh, 1000, 100),
            create_test_image_with_burst_id("img002.jpg", "cam1", DriveMode::ContinuousHigh, 1001, 100),
            create_test_image_with_burst_id("img003.jpg", "cam1", DriveMode::ContinuousHigh, 1002, 100),
            create_test_image_with_burst_id("img004.jpg", "cam1", DriveMode::ContinuousHigh, 1010, 200),
            create_test_image_with_burst_id("img005.jpg", "cam1", DriveMode::ContinuousHigh, 1011, 200),
        ];

        let result = BurstDetector::detect(images).unwrap();

        assert_eq!(result.bursts.len(), 2);
        assert_eq!(result.singles.len(), 0);
        assert_eq!(result.bursts[0].frame_count, 3);
        assert_eq!(result.bursts[1].frame_count, 2);
    }

    #[test]
    fn test_native_burst_id_single_frame_not_burst() {
        // Single-frame "bursts" (quick tap in CH mode) should be singles
        let images = vec![
            create_test_image_with_burst_id("img001.jpg", "cam1", DriveMode::ContinuousHigh, 1000, 100),
            create_test_image_with_burst_id("img002.jpg", "cam1", DriveMode::ContinuousHigh, 1010, 200),
            create_test_image_with_burst_id("img003.jpg", "cam1", DriveMode::ContinuousHigh, 1011, 200),
        ];

        let result = BurstDetector::detect(images).unwrap();

        assert_eq!(result.bursts.len(), 1); // Only burst 200
        assert_eq!(result.singles.len(), 1); // Burst 100 was single-frame
        assert_eq!(result.bursts[0].frame_count, 2);
    }

    #[test]
    fn test_mixed_native_and_no_id_cameras() {
        // Camera 1 has native burst IDs, camera 2 doesn't
        let mut img1 = create_test_image("img001.jpg", "cam1", DriveMode::ContinuousHigh, 1000);
        img1.burst_group_id = Some(100);
        let mut img2 = create_test_image("img002.jpg", "cam1", DriveMode::ContinuousHigh, 1001);
        img2.burst_group_id = Some(100);
        let img3 = create_test_image("img003.jpg", "cam2", DriveMode::ContinuousHigh, 1000);
        let img4 = create_test_image("img004.jpg", "cam2", DriveMode::ContinuousHigh, 1001);

        let images = vec![img1, img2, img3, img4];
        let result = BurstDetector::detect(images).unwrap();

        assert_eq!(result.bursts.len(), 2); // One from each camera
        assert_eq!(result.cameras.len(), 2);
    }

    #[test]
    fn test_burst_result_stats() {
        let images = vec![
            create_test_image("img001.jpg", "camera1", DriveMode::ContinuousHigh, 1000),
            create_test_image("img002.jpg", "camera1", DriveMode::ContinuousHigh, 1001),
            create_test_image("img003.jpg", "camera1", DriveMode::Single, 1010),
        ];

        let result = BurstDetector::detect(images).unwrap();
        
        assert_eq!(result.total_images(), 3);
        assert_eq!(result.total_bursts(), 1);
        
        let camera_info = result.camera_info("camera1").unwrap();
        assert_eq!(camera_info.image_count, 3);
        assert_eq!(camera_info.burst_count, 1);
    }
}