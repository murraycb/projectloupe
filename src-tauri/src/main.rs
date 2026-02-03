// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{command, State};
use burst_detection::{BurstDetector, BurstResult, ExifData, ExiftoolRunner};

/// Supported image file extensions
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "cr3", "cr2", "nef", "arw", "raf", "dng", "rw2", "orf",
];

// -- State --

struct AppState {
    /// Persistent exiftool process for fast EXIF extraction
    exiftool: Mutex<Option<ExiftoolRunner>>,
    /// Last analysis result (cached for frontend queries)
    last_result: Mutex<Option<BurstResult>>,
}

// -- Command payloads --

#[derive(Debug, Deserialize)]
struct ImportRequest {
    folder_path: String,
}

#[derive(Debug, Serialize)]
struct ImportResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<BurstResultPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Serializable burst result for the frontend
#[derive(Debug, Serialize)]
struct BurstResultPayload {
    total_images: usize,
    total_bursts: usize,
    total_singles: usize,
    cameras: Vec<CameraPayload>,
    bursts: Vec<BurstPayload>,
    singles: Vec<ImagePayload>,
}

#[derive(Debug, Serialize)]
struct CameraPayload {
    serial: String,
    make: String,
    model: String,
    image_count: usize,
    burst_count: usize,
}

#[derive(Debug, Serialize)]
struct BurstPayload {
    id: String,
    camera_serial: String,
    frame_count: usize,
    duration_ms: i64,
    avg_gap_ms: f64,
    estimated_fps: f64,
    images: Vec<ImagePayload>,
}

#[derive(Debug, Serialize)]
struct ImagePayload {
    file_path: String,
    filename: String,
    serial_number: String,
    drive_mode: String,
    capture_time: String,
    make: Option<String>,
    model: Option<String>,
    lens: Option<String>,
    focal_length: Option<f64>,
    aperture: Option<f64>,
    shutter_speed: Option<String>,
    iso: Option<u32>,
}

// -- Conversions --

fn exif_to_payload(exif: &ExifData) -> ImagePayload {
    ImagePayload {
        file_path: exif.file_path.display().to_string(),
        filename: exif.file_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
        serial_number: exif.serial_number.clone(),
        drive_mode: format!("{:?}", exif.drive_mode),
        capture_time: exif.capture_time.to_rfc3339(),
        make: exif.make.clone(),
        model: exif.model.clone(),
        lens: exif.lens.clone(),
        focal_length: exif.focal_length,
        aperture: exif.aperture,
        shutter_speed: exif.shutter_speed.clone(),
        iso: exif.iso,
    }
}

fn result_to_payload(result: &BurstResult) -> BurstResultPayload {
    BurstResultPayload {
        total_images: result.total_images(),
        total_bursts: result.total_bursts(),
        total_singles: result.singles.len(),
        cameras: result.cameras.iter().map(|c| CameraPayload {
            serial: c.serial.clone(),
            make: c.make.clone(),
            model: c.model.clone(),
            image_count: c.image_count,
            burst_count: c.burst_count,
        }).collect(),
        bursts: result.bursts.iter().map(|b| BurstPayload {
            id: b.id.clone(),
            camera_serial: b.camera_serial.clone(),
            frame_count: b.frame_count,
            duration_ms: b.duration_ms,
            avg_gap_ms: b.avg_gap_ms,
            estimated_fps: b.estimated_fps,
            images: b.images.iter().map(exif_to_payload).collect(),
        }).collect(),
        singles: result.singles.iter().map(exif_to_payload).collect(),
    }
}

// -- Commands --

/// Import a folder: scan for images, extract EXIF, detect bursts.
/// Returns structured burst/single data for the frontend.
#[command]
async fn import_folder(
    request: ImportRequest,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    let folder_path = PathBuf::from(&request.folder_path);

    if !folder_path.is_dir() {
        return Ok(ImportResult {
            success: false,
            result: None,
            error: Some(format!("Not a directory: {}", folder_path.display())),
        });
    }

    // 1. Scan folder for image files
    let image_paths = scan_folder(&folder_path).map_err(|e| e.to_string())?;

    if image_paths.is_empty() {
        return Ok(ImportResult {
            success: false,
            result: None,
            error: Some("No supported image files found in folder".to_string()),
        });
    }

    // 2. Extract EXIF data via exiftool
    let exif_data = {
        let mut exiftool_guard = state.exiftool.lock().map_err(|e| e.to_string())?;

        // Lazily initialize exiftool runner
        if exiftool_guard.is_none() {
            *exiftool_guard = Some(
                ExiftoolRunner::new().map_err(|e| format!("Failed to start exiftool: {}", e))?
            );
        }

        let runner = exiftool_guard.as_mut().unwrap();
        runner.extract(&image_paths).map_err(|e| format!("EXIF extraction failed: {}", e))?
    };

    // 3. Detect bursts
    let burst_result = BurstDetector::detect(exif_data)
        .map_err(|e| format!("Burst detection failed: {}", e))?;

    let payload = result_to_payload(&burst_result);

    // Cache result
    if let Ok(mut cache) = state.last_result.lock() {
        *cache = Some(burst_result);
    }

    Ok(ImportResult {
        success: true,
        result: Some(payload),
        error: None,
    })
}

/// Get the cached analysis result (avoids re-running detection)
#[command]
async fn get_analysis(state: State<'_, AppState>) -> Result<Option<BurstResultPayload>, String> {
    let cache = state.last_result.lock().map_err(|e| e.to_string())?;
    Ok(cache.as_ref().map(result_to_payload))
}

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// -- Helpers --

/// Recursively scan a folder for supported image files
fn scan_folder(folder: &PathBuf) -> anyhow::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();

    for entry in std::fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            // Recurse into subdirectories
            paths.extend(scan_folder(&path)?);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                paths.push(path);
            }
        }
    }

    Ok(paths)
}

// -- Main --

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            exiftool: Mutex::new(None),
            last_result: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            import_folder,
            get_analysis,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
