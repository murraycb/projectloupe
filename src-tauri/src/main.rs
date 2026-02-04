//! ProjectLoupe Tauri backend — bridges the Rust burst-detection crate to the React frontend.
//!
//! Command architecture:
//! - `import_folder`: Scan → exiftool EXIF extraction → burst detection → structured JSON response
//! - `extract_thumbnails`: Batch extract PreviewImage (640px) for grid thumbnails
//! - `extract_loupe_image` / `extract_burst_loupe_images`: On-demand JpgFromRaw (8K) for loupe view
//!
//! Thumbnail strategy (two-tier):
//! - Grid: PreviewImage (~150KB, 640px) — extracted in bulk after import, ~1.3s for 73 files
//! - Loupe: JpgFromRaw (~3.5MB, 8256×5504) — extracted on-demand when loupe opens, cached
//!
//! Both tiers cache to ~/.projectloupe/cache/{thumbnails,loupe}/ and are served to the
//! frontend via Tauri's asset:// protocol (convertFileSrc).
//!
//! State management: AppState holds a persistent exiftool process (Mutex<Option<ExiftoolRunner>>)
//! to avoid respawning for each command. The last BurstResult is cached for the analysis endpoint.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{command, State, Manager, Emitter};
use burst_detection::{BurstDetector, BurstResult, ExifData, ExiftoolRunner};
use session_db::{SessionDb, ImageRecord, BurstGroupRecord};

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
    /// SQLite session database (initialized on first import/load)
    session_db: Mutex<Option<SessionDb>>,
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

/// Convert a frontend ImagePayload to a database ImageRecord.
fn payload_to_record(img: &ImagePayload, burst_id: Option<&str>, burst_index: Option<i32>) -> ImageRecord {
    let path = PathBuf::from(&img.file_path);
    let (file_size, file_mtime) = std::fs::metadata(&path)
        .map(|m| {
            let size = m.len() as i64;
            let mtime = m.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            (size, mtime)
        })
        .unwrap_or((0, 0));

    ImageRecord {
        file_path: img.file_path.clone(),
        filename: img.filename.clone(),
        file_size,
        file_mtime,
        cache_hash: format!("{:x}", file_size.wrapping_mul(file_mtime.wrapping_add(1))),
        serial_number: img.serial_number.clone(),
        drive_mode: img.drive_mode.clone(),
        capture_time: img.capture_time.clone(),
        make: img.make.clone(),
        model: img.model.clone(),
        lens: img.lens.clone(),
        focal_length: img.focal_length,
        aperture: img.aperture,
        shutter_speed: img.shutter_speed.clone(),
        iso: img.iso,
        rating: 0,
        flag: "none".to_string(),
        color_label: "none".to_string(),
        burst_group_id: burst_id.map(|s| s.to_string()),
        burst_index,
        micro_cached: false,
        preview_cached: false,
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

    // 4. Persist to SQLite
    {
        let db = SessionDb::open(&request.folder_path)
            .map_err(|e| format!("Failed to open session DB: {}", e))?;

        db.set_meta("root_folder", &request.folder_path)
            .map_err(|e| e.to_string())?;

        // Convert to image records
        let mut records: Vec<ImageRecord> = Vec::new();
        for burst in &payload.bursts {
            for (i, img) in burst.images.iter().enumerate() {
                records.push(payload_to_record(img, Some(&burst.id), Some(i as i32)));
            }
        }
        for img in &payload.singles {
            records.push(payload_to_record(img, None, None));
        }
        db.upsert_images(&records).map_err(|e| e.to_string())?;

        // Persist burst groups
        let burst_records: Vec<BurstGroupRecord> = payload.bursts.iter().map(|b| {
            BurstGroupRecord {
                id: b.id.clone(),
                camera_serial: b.camera_serial.clone(),
                frame_count: b.frame_count as i32,
                duration_ms: b.duration_ms,
                avg_gap_ms: b.avg_gap_ms,
                estimated_fps: b.estimated_fps,
            }
        }).collect();
        db.upsert_burst_groups(&burst_records).map_err(|e| e.to_string())?;

        // Store the DB handle
        if let Ok(mut db_guard) = state.session_db.lock() {
            *db_guard = Some(db);
        }
    }

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

/// Extract the full-resolution embedded JPEG (JpgFromRaw) for loupe view.
/// On-demand: only extracts when requested, caches for subsequent views.
/// Returns the path to the cached full-res JPEG.
#[command]
async fn extract_loupe_image(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let source = PathBuf::from(&file_path);
    if !source.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let stem = source.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    let loupe_dir = state.cache_dir.join("loupe");
    std::fs::create_dir_all(&loupe_dir)
        .map_err(|e| format!("Failed to create loupe cache dir: {}", e))?;

    let loupe_path = loupe_dir.join(format!("{}.jpg", stem));

    // Return cached if already extracted
    if loupe_path.exists() {
        return Ok(loupe_path.display().to_string());
    }

    // Extract JpgFromRaw (full-res embedded JPEG) via exiftool
    let output = std::process::Command::new("exiftool")
        .arg("-b")
        .arg("-JpgFromRaw")
        .arg(&source)
        .output()
        .map_err(|e| format!("Failed to run exiftool: {}", e))?;

    if output.stdout.is_empty() {
        // Fallback to PreviewImage if JpgFromRaw not available
        let output2 = std::process::Command::new("exiftool")
            .arg("-b")
            .arg("-PreviewImage")
            .arg(&source)
            .output()
            .map_err(|e| format!("Failed to run exiftool fallback: {}", e))?;

        if output2.stdout.is_empty() {
            return Err("No embedded JPEG found in file".to_string());
        }

        std::fs::write(&loupe_path, &output2.stdout)
            .map_err(|e| format!("Failed to write loupe image: {}", e))?;
    } else {
        std::fs::write(&loupe_path, &output.stdout)
            .map_err(|e| format!("Failed to write loupe image: {}", e))?;
    }

    Ok(loupe_path.display().to_string())
}

/// Batch extract loupe images for a burst (pre-fetch for smooth scrubbing)
#[command]
async fn extract_burst_loupe_images(
    file_paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, String> {
    let loupe_dir = state.cache_dir.join("loupe");
    std::fs::create_dir_all(&loupe_dir)
        .map_err(|e| format!("Failed to create loupe cache dir: {}", e))?;

    // Collect paths that need extraction
    let mut to_extract: Vec<PathBuf> = Vec::new();
    let mut result_map: HashMap<String, String> = HashMap::new();

    for fp in &file_paths {
        let source = PathBuf::from(fp);
        let stem = source.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let loupe_path = loupe_dir.join(format!("{}.jpg", stem));

        if loupe_path.exists() {
            result_map.insert(fp.clone(), loupe_path.display().to_string());
        } else {
            to_extract.push(source);
        }
    }

    if !to_extract.is_empty() {
        // Batch extract via exiftool -w
        let mut cmd = std::process::Command::new("exiftool");
        cmd.arg("-b")
           .arg("-JpgFromRaw")
           .arg("-w")
           .arg(format!("{}/%f.jpg", loupe_dir.display()));

        for path in &to_extract {
            cmd.arg(path.as_os_str());
        }

        let _ = cmd.output();

        // Map results
        for path in &to_extract {
            let stem = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown");
            let loupe_path = loupe_dir.join(format!("{}.jpg", stem));
            if loupe_path.exists() {
                result_map.insert(path.display().to_string(), loupe_path.display().to_string());
            }
        }
    }

    Ok(result_map)
}

/// Check if a session exists for the given folder and load it.
/// Returns the same ImportResult format as import_folder for frontend compatibility.
#[command]
async fn load_session(
    folder_path: String,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    if !SessionDb::exists(&folder_path) {
        return Ok(ImportResult {
            success: false,
            result: None,
            error: Some("No session found for this folder".to_string()),
        });
    }

    let db = SessionDb::open(&folder_path)
        .map_err(|e| format!("Failed to open session DB: {}", e))?;

    let images = db.load_images().map_err(|e| e.to_string())?;
    let burst_groups = db.load_burst_groups().map_err(|e| e.to_string())?;

    if images.is_empty() {
        return Ok(ImportResult {
            success: false,
            result: None,
            error: Some("Session database is empty".to_string()),
        });
    }

    // Reconstruct the payload from DB records
    let mut cameras_map: HashMap<String, CameraPayload> = HashMap::new();
    let mut burst_images: HashMap<String, Vec<ImagePayload>> = HashMap::new();
    let mut singles: Vec<ImagePayload> = Vec::new();

    for img in &images {
        // Track cameras
        let cam = cameras_map.entry(img.serial_number.clone()).or_insert_with(|| CameraPayload {
            serial: img.serial_number.clone(),
            make: img.make.clone().unwrap_or_default(),
            model: img.model.clone().unwrap_or_default(),
            image_count: 0,
            burst_count: 0,
        });
        cam.image_count += 1;

        let payload = ImagePayload {
            file_path: img.file_path.clone(),
            filename: img.filename.clone(),
            serial_number: img.serial_number.clone(),
            drive_mode: img.drive_mode.clone(),
            capture_time: img.capture_time.clone(),
            make: img.make.clone(),
            model: img.model.clone(),
            lens: img.lens.clone(),
            focal_length: img.focal_length,
            aperture: img.aperture,
            shutter_speed: img.shutter_speed.clone(),
            iso: img.iso,
            burst_group_id: None,
            high_frame_rate: None,
        };

        if let Some(ref burst_id) = img.burst_group_id {
            burst_images.entry(burst_id.clone()).or_default().push(payload);
        } else {
            singles.push(payload);
        }
    }

    // Count bursts per camera
    for bg in &burst_groups {
        if let Some(cam) = cameras_map.get_mut(&bg.camera_serial) {
            cam.burst_count += 1;
        }
    }

    // Build burst payloads
    let bursts: Vec<BurstPayload> = burst_groups.iter().map(|bg| {
        BurstPayload {
            id: bg.id.clone(),
            camera_serial: bg.camera_serial.clone(),
            frame_count: bg.frame_count as usize,
            duration_ms: bg.duration_ms,
            avg_gap_ms: bg.avg_gap_ms,
            estimated_fps: bg.estimated_fps,
            images: burst_images.remove(&bg.id).unwrap_or_default(),
        }
    }).collect();

    // Build result with persisted user annotations
    let total_images = images.len();
    let total_bursts = bursts.len();
    let total_singles = singles.len();

    // Store DB handle for future write-through
    if let Ok(mut db_guard) = state.session_db.lock() {
        *db_guard = Some(db);
    }

    // Build payload — we need to include the persisted flags/ratings.
    // The frontend will read these from a separate annotations structure.
    let result = BurstResultPayload {
        total_images,
        total_bursts,
        total_singles,
        cameras: cameras_map.into_values().collect(),
        bursts,
        singles,
    };

    Ok(ImportResult {
        success: true,
        result: Some(result),
        error: None,
    })
}

/// Persist a flag change to SQLite (write-through from UI).
#[command]
async fn persist_flag(
    file_path: String,
    flag: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.session_db.lock().map_err(|e| e.to_string())?;
    if let Some(ref db) = *db_guard {
        db.update_flag(&file_path, &flag).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Persist a rating change to SQLite.
#[command]
async fn persist_rating(
    file_path: String,
    rating: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.session_db.lock().map_err(|e| e.to_string())?;
    if let Some(ref db) = *db_guard {
        db.update_rating(&file_path, rating).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Persist a color label change to SQLite.
#[command]
async fn persist_color_label(
    file_path: String,
    color_label: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.session_db.lock().map_err(|e| e.to_string())?;
    if let Some(ref db) = *db_guard {
        db.update_color_label(&file_path, &color_label).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Persist batch flag changes (e.g., burst flagging).
#[command]
async fn persist_flags_batch(
    updates: Vec<(String, String)>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_guard = state.session_db.lock().map_err(|e| e.to_string())?;
    if let Some(ref db) = *db_guard {
        let refs: Vec<(&str, &str)> = updates.iter().map(|(p, f)| (p.as_str(), f.as_str())).collect();
        db.update_flags_batch(&refs).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Load persisted annotations (flags, ratings, labels) for session restore.
/// Returns a map of file_path → {flag, rating, colorLabel}.
#[command]
async fn load_annotations(
    state: State<'_, AppState>,
) -> Result<HashMap<String, AnnotationPayload>, String> {
    let db_guard = state.session_db.lock().map_err(|e| e.to_string())?;
    if let Some(ref db) = *db_guard {
        let images = db.load_images().map_err(|e| e.to_string())?;
        let mut annotations = HashMap::new();
        for img in images {
            if img.flag != "none" || img.rating != 0 || img.color_label != "none" {
                annotations.insert(img.file_path, AnnotationPayload {
                    flag: img.flag,
                    rating: img.rating,
                    color_label: img.color_label,
                });
            }
        }
        Ok(annotations)
    } else {
        Ok(HashMap::new())
    }
}

#[derive(Debug, Serialize)]
struct AnnotationPayload {
    flag: String,
    rating: i32,
    color_label: String,
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
            session_db: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            import_folder,
            get_analysis,
            extract_thumbnails,
            get_thumbnail,
            extract_loupe_image,
            extract_burst_loupe_images,
            load_session,
            persist_flag,
            persist_rating,
            persist_color_label,
            persist_flags_batch,
            load_annotations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
