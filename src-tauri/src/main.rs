// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{command, State, Manager, Emitter};
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
    /// Cache directory for thumbnails
    cache_dir: PathBuf,
    /// Map of source file path → thumbnail cache path
    thumbnail_cache: Mutex<HashMap<String, String>>,
}

// -- Command payloads --

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    burst_group_id: Option<u64>,
    high_frame_rate: Option<String>,
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
        burst_group_id: exif.burst_group_id,
        high_frame_rate: exif.high_frame_rate.clone(),
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

/// Extract embedded JPEG previews from image files into the cache directory.
/// Uses exiftool -PreviewImage for grid thumbnails (~640px, ~150KB each).
/// Returns a map of source file path → thumbnail file path.
#[command]
async fn extract_thumbnails(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<HashMap<String, String>, String> {
    let result_guard = state.last_result.lock().map_err(|e| e.to_string())?;
    let result = result_guard.as_ref().ok_or("No import result — import a folder first")?;

    // Collect all image paths
    let mut all_paths: Vec<&PathBuf> = Vec::new();
    for burst in &result.bursts {
        for img in &burst.images {
            all_paths.push(&img.file_path);
        }
    }
    for img in &result.singles {
        all_paths.push(&img.file_path);
    }

    let thumb_dir = state.cache_dir.join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| format!("Failed to create thumbnail dir: {}", e))?;

    // Run exiftool to extract PreviewImage for all files
    // exiftool -b -PreviewImage -w <thumb_dir>/%f.jpg <files...>
    let mut cmd = std::process::Command::new("exiftool");
    cmd.arg("-b")
       .arg("-PreviewImage")
       .arg("-w")
       .arg(format!("{}/%f.jpg", thumb_dir.display()));

    for path in &all_paths {
        cmd.arg(path.as_os_str());
    }

    let output = cmd.output().map_err(|e| format!("Failed to run exiftool for thumbnails: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("exiftool thumbnail extraction stderr: {}", stderr);
        // Don't fail — some files might not have PreviewImage
    }

    // Build mapping: source path → thumbnail path
    let mut thumb_map = HashMap::new();
    for path in &all_paths {
        let stem = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let thumb_path = thumb_dir.join(format!("{}.jpg", stem));
        if thumb_path.exists() {
            let source_key = path.display().to_string();
            let thumb_value = thumb_path.display().to_string();
            thumb_map.insert(source_key, thumb_value);
        }
    }

    // Cache the mappings
    if let Ok(mut cache) = state.thumbnail_cache.lock() {
        cache.extend(thumb_map.clone());
    }

    // Emit event so frontend knows thumbnails are ready
    let _ = app.emit("thumbnails-ready", thumb_map.len());

    Ok(thumb_map)
}

/// Get the thumbnail path for a single image (if cached)
#[command]
async fn get_thumbnail(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let cache = state.thumbnail_cache.lock().map_err(|e| e.to_string())?;
    Ok(cache.get(&file_path).cloned())
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
    let cache_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".projectloupe")
        .join("cache");

    // Ensure cache dir exists
    let _ = std::fs::create_dir_all(&cache_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            exiftool: Mutex::new(None),
            last_result: Mutex::new(None),
            cache_dir,
            thumbnail_cache: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            import_folder,
            get_analysis,
            extract_thumbnails,
            get_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
