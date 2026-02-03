// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::command;
use burst_detection::{BurstGroup, BurstDetector, BurstConfig, ImageInfo, QualityAnalyzer};

#[derive(Debug, Serialize, Deserialize)]
struct AnalysisRequest {
    folder_path: String,
    max_gap_ms: Option<i64>,
    min_burst_size: Option<usize>,
    include_quality: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalysisResult {
    success: bool,
    burst_groups: Option<Vec<BurstGroup>>,
    error: Option<String>,
    total_images: usize,
    burst_count: usize,
    single_count: usize,
}

#[command]
async fn analyze_folder(request: AnalysisRequest) -> AnalysisResult {
    match perform_analysis(request).await {
        Ok((burst_groups, total_images, burst_count, single_count)) => AnalysisResult {
            success: true,
            burst_groups: Some(burst_groups),
            error: None,
            total_images,
            burst_count,
            single_count,
        },
        Err(e) => AnalysisResult {
            success: false,
            burst_groups: None,
            error: Some(e.to_string()),
            total_images: 0,
            burst_count: 0,
            single_count: 0,
        },
    }
}

async fn perform_analysis(request: AnalysisRequest) -> Result<(Vec<BurstGroup>, usize, usize, usize)> {
    let folder_path = PathBuf::from(&request.folder_path);
    let max_gap_ms = request.max_gap_ms.unwrap_or(2000);
    let min_burst_size = request.min_burst_size.unwrap_or(3);
    let include_quality = request.include_quality.unwrap_or(false);
    
    // Configure burst detector
    let config = BurstConfig {
        max_gap_ms,
        min_burst_size,
        max_burst_size: 200,
    };
    
    let detector = BurstDetector::new(config);
    let quality_analyzer = if include_quality {
        Some(QualityAnalyzer::new()?)
    } else {
        None
    };
    
    // Scan folder for image files
    let image_extensions = ["jpg", "jpeg", "cr3", "cr2", "nef", "arw", "raf", "dng"];
    let mut image_paths = Vec::new();
    
    if folder_path.is_dir() {
        for entry in std::fs::read_dir(&folder_path)? {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(extension) = path.extension() {
                if let Some(ext_str) = extension.to_str() {
                    if image_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        image_paths.push(path);
                    }
                }
            }
        }
    }
    
    image_paths.sort();
    
    // Extract metadata from all images
    let mut images = Vec::new();
    
    for path in image_paths {
        if let Ok(mut image_info) = ImageInfo::from_file(&path) {
            // Add quality analysis if requested
            if let Some(ref analyzer) = quality_analyzer {
                if let Ok(quality_score) = analyzer.analyze_image(&path) {
                    image_info.quality_score = Some(quality_score);
                }
            }
            images.push(image_info);
        }
    }
    
    // Detect burst groups
    let burst_groups = detector.detect_bursts(images)?;
    
    let total_images: usize = burst_groups.iter().map(|g| g.images.len()).sum();
    let burst_count = burst_groups.iter().filter(|g| g.images.len() >= min_burst_size).count();
    let single_count = burst_groups.len() - burst_count;
    
    Ok((burst_groups, total_images, burst_count, single_count))
}

#[command]
async fn import_folder(folder_path: String) -> Result<bool, String> {
    // Stub implementation for now - will be wired up to actual logic later
    println!("Importing folder: {}", folder_path);
    Ok(true)
}

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust and Tauri!", name)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, analyze_folder, import_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}