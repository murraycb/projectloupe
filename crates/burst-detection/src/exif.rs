//! EXIF data extraction using exiftool for ProjectLoupe
//! 
//! This module provides efficient EXIF metadata extraction using exiftool's
//! stay-open mode for high performance batch processing.

use std::path::PathBuf;
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write, BufWriter};
use chrono::{DateTime, Utc, NaiveDateTime, Timelike};
use serde::{Deserialize, Serialize};
use anyhow::{Result, Context, bail};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DriveMode {
    Single,
    ContinuousLow,
    ContinuousHigh,
    Unknown,
}

impl DriveMode {
    /// Check if this drive mode indicates continuous shooting
    pub fn is_continuous(&self) -> bool {
        matches!(self, DriveMode::ContinuousLow | DriveMode::ContinuousHigh)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExifData {
    pub serial_number: String,
    pub drive_mode: DriveMode,
    pub capture_time: DateTime<Utc>,
    pub make: Option<String>,
    pub model: Option<String>,
    pub lens: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,
    pub file_path: PathBuf,
    /// Camera-native burst group ID (e.g., Nikon BurstGroupID)
    pub burst_group_id: Option<u64>,
    /// High frame rate mode (e.g., "CH", "CL", "Off")
    pub high_frame_rate: Option<String>,
}

impl ExifData {
    /// Create a new ExifData with minimal required fields
    pub fn new(file_path: PathBuf, serial_number: String, drive_mode: DriveMode, capture_time: DateTime<Utc>) -> Self {
        Self {
            serial_number,
            drive_mode,
            capture_time,
            make: None,
            model: None,
            lens: None,
            focal_length: None,
            aperture: None,
            shutter_speed: None,
            iso: None,
            file_path,
            burst_group_id: None,
            high_frame_rate: None,
        }
    }
}

/// Deserialize a value that could be a string or number into Option<String>
fn deserialize_string_or_number<'de, D>(deserializer: D) -> std::result::Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct StringOrNumber;
    impl<'de> de::Visitor<'de> for StringOrNumber {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or number")
        }

        fn visit_str<E: de::Error>(self, v: &str) -> std::result::Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_string<E: de::Error>(self, v: String) -> std::result::Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_i64<E: de::Error>(self, v: i64) -> std::result::Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_u64<E: de::Error>(self, v: u64) -> std::result::Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_f64<E: de::Error>(self, v: f64) -> std::result::Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_none<E: de::Error>(self) -> std::result::Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> std::result::Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(StringOrNumber)
}

#[derive(Deserialize)]
struct ExiftoolOutput {
    #[serde(rename = "SerialNumber", deserialize_with = "deserialize_string_or_number", default)]
    serial_number: Option<String>,
    #[serde(rename = "InternalSerialNumber", deserialize_with = "deserialize_string_or_number", default)]
    internal_serial_number: Option<String>,
    #[serde(rename = "DriveMode")]
    drive_mode: Option<String>,
    #[serde(rename = "ShootingMode")]
    shooting_mode: Option<String>,
    #[serde(rename = "DateTimeOriginal")]
    date_time_original: Option<String>,
    #[serde(rename = "SubSecTimeOriginal", deserialize_with = "deserialize_string_or_number", default)]
    subsec_time_original: Option<String>,
    #[serde(rename = "Make")]
    make: Option<String>,
    #[serde(rename = "Model")]
    model: Option<String>,
    #[serde(rename = "LensModel")]
    lens_model: Option<String>,
    #[serde(rename = "FocalLength")]
    focal_length: Option<String>,
    #[serde(rename = "Aperture", deserialize_with = "deserialize_string_or_number", default)]
    aperture: Option<String>,
    #[serde(rename = "ShutterSpeed", deserialize_with = "deserialize_string_or_number", default)]
    shutter_speed: Option<String>,
    #[serde(rename = "ISO")]
    iso: Option<serde_json::Value>,
    #[serde(rename = "BurstGroupID")]
    burst_group_id: Option<u64>,
    #[serde(rename = "HighFrameRate")]
    high_frame_rate: Option<String>,
    #[serde(rename = "SourceFile")]
    source_file: String,
}

pub struct ExiftoolRunner {
    child: Child,
    stdin: BufWriter<std::process::ChildStdin>,
    stdout: BufReader<std::process::ChildStdout>,
}

impl ExiftoolRunner {
    /// Create a new ExiftoolRunner with a persistent exiftool process
    pub fn new() -> Result<Self> {
        let mut child = Command::new("exiftool")
            .args(["-stay_open", "True", "-@", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .context("Failed to spawn exiftool process. Make sure exiftool is installed and in PATH.")?;

        let stdin = BufWriter::new(
            child.stdin.take()
                .context("Failed to get stdin handle for exiftool process")?
        );

        let stdout = BufReader::new(
            child.stdout.take()
                .context("Failed to get stdout handle for exiftool process")?
        );

        Ok(Self {
            child,
            stdin,
            stdout,
        })
    }

    /// Extract EXIF data from multiple image files
    pub fn extract(&mut self, paths: &[PathBuf]) -> Result<Vec<ExifData>> {
        if paths.is_empty() {
            return Ok(Vec::new());
        }

        // Write exiftool arguments
        writeln!(self.stdin, "-json")?;
        writeln!(self.stdin, "-fast")?;  // -fast not -fast2: we need maker notes for BurstGroupID
        writeln!(self.stdin, "-SerialNumber")?;
        writeln!(self.stdin, "-InternalSerialNumber")?;
        writeln!(self.stdin, "-DriveMode")?;
        writeln!(self.stdin, "-ShootingMode")?;
        writeln!(self.stdin, "-BurstGroupID")?;
        writeln!(self.stdin, "-HighFrameRate")?;
        writeln!(self.stdin, "-DateTimeOriginal")?;
        writeln!(self.stdin, "-SubSecTimeOriginal")?;
        writeln!(self.stdin, "-Make")?;
        writeln!(self.stdin, "-Model")?;
        writeln!(self.stdin, "-LensModel")?;
        writeln!(self.stdin, "-FocalLength")?;
        writeln!(self.stdin, "-Aperture")?;
        writeln!(self.stdin, "-ShutterSpeed")?;
        writeln!(self.stdin, "-ISO")?;

        // Write file paths
        for path in paths {
            writeln!(self.stdin, "{}", path.display())?;
        }

        // Execute command
        writeln!(self.stdin, "-execute")?;
        self.stdin.flush()?;

        // Read JSON output until {ready} sentinel
        let mut json_output = String::new();
        loop {
            let mut line = String::new();
            let bytes_read = self.stdout.read_line(&mut line)?;
            if bytes_read == 0 {
                bail!("Unexpected EOF from exiftool process");
            }

            let trimmed = line.trim();
            if trimmed.starts_with("{ready") && trimmed.ends_with("}") {
                break;
            }
            json_output.push_str(&line);
        }

        // Parse JSON output
        let exiftool_data: Vec<ExiftoolOutput> = serde_json::from_str(&json_output)
            .with_context(|| {
                let preview = if json_output.len() > 500 {
                    format!("{}...(truncated, {} bytes total)", &json_output[..500], json_output.len())
                } else {
                    json_output.clone()
                };
                format!("Failed to parse exiftool JSON output. First bytes: {}", preview)
            })?;

        // Convert to our ExifData format
        let mut results = Vec::new();
        let _unknown_serial_counter = 0;
        let mut make_model_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

        for data in exiftool_data {
            let file_path = PathBuf::from(data.source_file);
            
            // Determine serial number with fallback logic
            let serial_number = if let Some(serial) = data.serial_number {
                serial
            } else if let Some(internal_serial) = data.internal_serial_number {
                internal_serial
            } else {
                // Use Make+Model as fallback, with incrementing counter for uniqueness
                let make_model = match (&data.make, &data.model) {
                    (Some(make), Some(model)) => format!("{}_{}", make, model),
                    (Some(make), None) => make.clone(),
                    (None, Some(model)) => model.clone(),
                    (None, None) => "unknown".to_string(),
                };
                
                let counter = make_model_map.entry(make_model.clone()).or_insert(0);
                *counter += 1;
                format!("unknown_{}_{}", make_model, counter)
            };

            // Parse drive mode
            let drive_mode = parse_drive_mode(
                data.drive_mode.as_deref().unwrap_or(""),
                data.shooting_mode.as_deref().unwrap_or("")
            );

            // Parse capture time
            let capture_time = parse_capture_time(
                data.date_time_original.as_deref(),
                data.subsec_time_original.as_deref()
            ).unwrap_or_else(|| Utc::now());

            // Parse numeric fields
            let focal_length = data.focal_length.as_ref()
                .and_then(|f| f.split_whitespace().next())
                .and_then(|f| f.parse().ok());

            let aperture = data.aperture.as_ref()
                .and_then(|a| a.parse().ok());

            let iso = data.iso.and_then(|v| match v {
                serde_json::Value::Number(n) => n.as_u64().map(|n| n as u32),
                serde_json::Value::String(s) => s.parse().ok(),
                _ => None,
            });

            results.push(ExifData {
                serial_number,
                drive_mode,
                capture_time,
                make: data.make,
                model: data.model,
                lens: data.lens_model,
                focal_length,
                aperture,
                shutter_speed: data.shutter_speed,
                iso,
                file_path,
                burst_group_id: data.burst_group_id,
                high_frame_rate: data.high_frame_rate,
            });
        }

        Ok(results)
    }
}

impl Drop for ExiftoolRunner {
    fn drop(&mut self) {
        // Gracefully shut down exiftool
        let _ = writeln!(self.stdin, "-stay_open");
        let _ = writeln!(self.stdin, "False");
        let _ = self.stdin.flush();
        let _ = self.child.wait();
    }
}

/// Parse drive mode from raw exiftool output
fn parse_drive_mode(drive_mode_raw: &str, shooting_mode_raw: &str) -> DriveMode {
    let combined = format!("{} {}", drive_mode_raw, shooting_mode_raw).to_lowercase();
    
    if combined.contains("continuous") {
        if combined.contains("high") || combined.contains("hi") {
            DriveMode::ContinuousHigh
        } else if combined.contains("low") || combined.contains("lo") {
            DriveMode::ContinuousLow
        } else {
            // Default continuous to high
            DriveMode::ContinuousHigh
        }
    } else if combined.contains("single") {
        DriveMode::Single
    } else {
        DriveMode::Unknown
    }
}

/// Parse capture time with subsecond precision
fn parse_capture_time(date_time_original: Option<&str>, subsec_time_original: Option<&str>) -> Option<DateTime<Utc>> {
    let date_str = date_time_original?;
    
    // Parse base datetime
    let naive_dt = NaiveDateTime::parse_from_str(date_str, "%Y:%m:%d %H:%M:%S").ok()?;
    
    // Add subsecond precision if available
    let dt_with_subsec = if let Some(subsec) = subsec_time_original {
        if let Ok(subsec_num) = subsec.parse::<u32>() {
            // Subsec is typically 2-3 digits representing fractional seconds
            let subsec_digits = subsec.len() as u32;
            let subsec_nanos = subsec_num * (10u32.pow(9 - subsec_digits));
            naive_dt.with_nanosecond(subsec_nanos).unwrap_or(naive_dt)
        } else {
            naive_dt
        }
    } else {
        naive_dt
    };
    
    Some(DateTime::from_naive_utc_and_offset(dt_with_subsec, Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Utc, Datelike};

    #[test]
    fn test_parse_drive_mode() {
        assert_eq!(parse_drive_mode("Single", ""), DriveMode::Single);
        assert_eq!(parse_drive_mode("Continuous High", ""), DriveMode::ContinuousHigh);
        assert_eq!(parse_drive_mode("Continuous Low", ""), DriveMode::ContinuousLow);
        assert_eq!(parse_drive_mode("", "Continuous Hi"), DriveMode::ContinuousHigh);
        assert_eq!(parse_drive_mode("", "Continuous Lo"), DriveMode::ContinuousLow);
        assert_eq!(parse_drive_mode("Continuous", ""), DriveMode::ContinuousHigh);
        assert_eq!(parse_drive_mode("Unknown", ""), DriveMode::Unknown);
    }

    #[test]
    fn test_parse_capture_time() {
        let dt = parse_capture_time(Some("2024:01:15 14:30:25"), Some("50"));
        assert!(dt.is_some());
        let dt = dt.unwrap();
        assert_eq!(dt.year(), 2024);
        assert_eq!(dt.month(), 1);
        assert_eq!(dt.day(), 15);
        assert_eq!(dt.hour(), 14);
        assert_eq!(dt.minute(), 30);
        assert_eq!(dt.second(), 25);
        assert_eq!(dt.nanosecond(), 500_000_000); // .50 seconds
    }

    #[test]
    fn test_drive_mode_is_continuous() {
        assert!(!DriveMode::Single.is_continuous());
        assert!(!DriveMode::Unknown.is_continuous());
        assert!(DriveMode::ContinuousLow.is_continuous());
        assert!(DriveMode::ContinuousHigh.is_continuous());
    }

    #[test]
    fn test_exif_data_creation() {
        let path = PathBuf::from("test.jpg");
        let serial = "12345".to_string();
        let drive_mode = DriveMode::ContinuousHigh;
        let time = Utc::now();
        
        let exif_data = ExifData::new(path.clone(), serial.clone(), drive_mode.clone(), time);
        
        assert_eq!(exif_data.file_path, path);
        assert_eq!(exif_data.serial_number, serial);
        assert_eq!(exif_data.drive_mode, drive_mode);
        assert_eq!(exif_data.capture_time, time);
    }
}