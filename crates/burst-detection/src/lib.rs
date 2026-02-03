//! Burst detection and image quality analysis library for ProjectLoupe
//! 
//! This crate provides functionality to detect burst sequences in photo collections
//! and analyze image quality metrics.

pub mod burst;
pub mod image_info;
pub mod quality;

pub use burst::{BurstGroup, BurstDetector, BurstConfig};
pub use image_info::{ImageInfo, ImageMetadata};
pub use quality::{QualityScore, QualityAnalyzer};