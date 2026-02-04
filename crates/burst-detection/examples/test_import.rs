use std::path::PathBuf;
use burst_detection::{ExiftoolRunner, BurstDetector};

fn main() {
    let folder = PathBuf::from("/tmp/projectloupe-build/test-raws");
    let mut paths: Vec<PathBuf> = std::fs::read_dir(&folder)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|e| e.to_ascii_lowercase() == std::ffi::OsStr::new("nef")).unwrap_or(false))
        .collect();
    paths.sort();
    
    println!("Found {} NEF files", paths.len());
    
    let mut runner = ExiftoolRunner::new().unwrap();
    let exif_data = runner.extract(&paths).unwrap();
    println!("Extracted EXIF for {} files", exif_data.len());
    
    let result = BurstDetector::detect(exif_data).unwrap();
    println!("\nCameras: {}", result.cameras.len());
    for cam in &result.cameras {
        println!("  {} {} (serial {}) — {} images, {} bursts", cam.make, cam.model, cam.serial, cam.image_count, cam.burst_count);
    }
    println!("\nBursts: {} total", result.total_bursts());
    for burst in &result.bursts {
        let first = burst.images.first().map(|i| i.file_path.file_name().unwrap().to_string_lossy().to_string()).unwrap_or_default();
        println!("  {} — {} frames, {:.1} fps, {}ms, starts: {}", burst.id, burst.frame_count, burst.estimated_fps, burst.duration_ms, first);
    }
    println!("\nSingles: {}", result.singles.len());
    for s in &result.singles {
        println!("  {}", s.file_path.file_name().unwrap().to_string_lossy());
    }
}
