//! Burst detection and image quality analysis library for ProjectLoupe
//! 
//! This crate provides functionality to detect burst sequences in photo collections
//! based on EXIF drive mode analysis and camera serial number partitioning,
//! along with AI-powered image quality metrics.

pub mod exif;
pub mod burst;
pub mod quality;

pub use exif::{ExifData, DriveMode, ExiftoolRunner};
pub use burst::{BurstGroup, BurstDetector, BurstResult, CameraInfo};
pub use quality::{QualityScore, QualityAnalyzer};