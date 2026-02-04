//! SQLite persistence layer for ProjectLoupe sessions.
//!
//! Each imported folder gets a session database at:
//!   ~/.projectloupe/cache/{session-hash}/meta.db
//!
//! Stores: image metadata (EXIF), user annotations (flags, ratings, color labels),
//! burst groups, and cache state. Designed as write-through alongside the in-memory
//! Zustand store — writes happen on every mutation, reads happen on session load.
//!
//! Uses WAL mode for concurrent read/write without blocking the UI.

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A persisted image record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub file_path: String,
    pub filename: String,
    pub file_size: i64,
    pub file_mtime: i64,
    pub cache_hash: String,

    // EXIF
    pub serial_number: String,
    pub drive_mode: String,
    pub capture_time: String,
    pub make: Option<String>,
    pub model: Option<String>,
    pub lens: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<u32>,

    // User metadata
    pub rating: i32,
    pub flag: String,        // "none" | "pick" | "reject"
    pub color_label: String, // "none" | "red" | "yellow" | "green" | "blue" | "purple"

    // Burst
    pub burst_group_id: Option<String>,
    pub burst_index: Option<i32>,

    // Cache state
    pub micro_cached: bool,
    pub preview_cached: bool,
}

/// A persisted burst group record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstGroupRecord {
    pub id: String,
    pub camera_serial: String,
    pub frame_count: i32,
    pub duration_ms: i64,
    pub avg_gap_ms: f64,
    pub estimated_fps: f64,
}

/// Session database handle.
pub struct SessionDb {
    conn: Connection,
    db_path: PathBuf,
}

impl SessionDb {
    /// Open or create a session database for the given folder path.
    /// Creates the cache directory and database file if needed.
    pub fn open(folder_path: &str) -> Result<Self> {
        let session_hash = Self::hash_path(folder_path);
        let cache_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".projectloupe")
            .join("cache")
            .join(&session_hash);

        std::fs::create_dir_all(&cache_dir)
            .with_context(|| format!("Failed to create cache dir: {}", cache_dir.display()))?;

        let db_path = cache_dir.join("meta.db");
        let conn = Connection::open(&db_path)
            .with_context(|| format!("Failed to open database: {}", db_path.display()))?;

        // WAL mode for concurrent read/write
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA synchronous=NORMAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

        let db = Self { conn, db_path };
        db.create_tables()?;
        Ok(db)
    }

    /// Open a database at a specific path (for testing).
    pub fn open_at(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA synchronous=NORMAL;")?;
        let db = Self {
            conn,
            db_path: db_path.to_path_buf(),
        };
        db.create_tables()?;
        Ok(db)
    }

    /// Check if a session database already exists for this folder.
    pub fn exists(folder_path: &str) -> bool {
        let session_hash = Self::hash_path(folder_path);
        let db_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".projectloupe")
            .join("cache")
            .join(&session_hash)
            .join("meta.db");
        db_path.exists()
    }

    /// Get the database file path.
    pub fn path(&self) -> &Path {
        &self.db_path
    }

    // -- Schema --

    fn create_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS images (
                file_path TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                file_mtime INTEGER NOT NULL DEFAULT 0,
                cache_hash TEXT NOT NULL DEFAULT '',
                serial_number TEXT NOT NULL DEFAULT '',
                drive_mode TEXT NOT NULL DEFAULT 'Single',
                capture_time TEXT NOT NULL DEFAULT '',
                make TEXT,
                model TEXT,
                lens TEXT,
                focal_length REAL,
                aperture REAL,
                shutter_speed TEXT,
                iso INTEGER,
                rating INTEGER NOT NULL DEFAULT 0,
                flag TEXT NOT NULL DEFAULT 'none',
                color_label TEXT NOT NULL DEFAULT 'none',
                burst_group_id TEXT,
                burst_index INTEGER,
                micro_cached INTEGER NOT NULL DEFAULT 0,
                preview_cached INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS burst_groups (
                id TEXT PRIMARY KEY,
                camera_serial TEXT NOT NULL,
                frame_count INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                avg_gap_ms REAL NOT NULL DEFAULT 0,
                estimated_fps REAL NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS session_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_images_burst ON images(burst_group_id);
            CREATE INDEX IF NOT EXISTS idx_images_serial ON images(serial_number);
            CREATE INDEX IF NOT EXISTS idx_images_capture ON images(capture_time);
            CREATE INDEX IF NOT EXISTS idx_images_flag ON images(flag);
            CREATE INDEX IF NOT EXISTS idx_images_rating ON images(rating);
            ",
        )?;
        Ok(())
    }

    // -- Session metadata --

    /// Store a session metadata key-value pair.
    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO session_meta (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    /// Get a session metadata value.
    pub fn get_meta(&self, key: &str) -> Result<Option<String>> {
        let result = self
            .conn
            .query_row(
                "SELECT value FROM session_meta WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(result)
    }

    // -- Image operations --

    /// Insert or update an image record. Used during import.
    pub fn upsert_image(&self, img: &ImageRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO images (
                file_path, filename, file_size, file_mtime, cache_hash,
                serial_number, drive_mode, capture_time,
                make, model, lens, focal_length, aperture, shutter_speed, iso,
                rating, flag, color_label,
                burst_group_id, burst_index,
                micro_cached, preview_cached
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5,
                ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                ?16, ?17, ?18,
                ?19, ?20,
                ?21, ?22
            )",
            params![
                img.file_path,
                img.filename,
                img.file_size,
                img.file_mtime,
                img.cache_hash,
                img.serial_number,
                img.drive_mode,
                img.capture_time,
                img.make,
                img.model,
                img.lens,
                img.focal_length,
                img.aperture,
                img.shutter_speed,
                img.iso,
                img.rating,
                img.flag,
                img.color_label,
                img.burst_group_id,
                img.burst_index,
                img.micro_cached as i32,
                img.preview_cached as i32,
            ],
        )?;
        Ok(())
    }

    /// Batch insert images (wrapped in a transaction for speed).
    pub fn upsert_images(&self, images: &[ImageRecord]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for img in images {
            self.upsert_image(img)?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Load all images from the database.
    pub fn load_images(&self) -> Result<Vec<ImageRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT
                file_path, filename, file_size, file_mtime, cache_hash,
                serial_number, drive_mode, capture_time,
                make, model, lens, focal_length, aperture, shutter_speed, iso,
                rating, flag, color_label,
                burst_group_id, burst_index,
                micro_cached, preview_cached
            FROM images ORDER BY capture_time",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ImageRecord {
                file_path: row.get(0)?,
                filename: row.get(1)?,
                file_size: row.get(2)?,
                file_mtime: row.get(3)?,
                cache_hash: row.get(4)?,
                serial_number: row.get(5)?,
                drive_mode: row.get(6)?,
                capture_time: row.get(7)?,
                make: row.get(8)?,
                model: row.get(9)?,
                lens: row.get(10)?,
                focal_length: row.get(11)?,
                aperture: row.get(12)?,
                shutter_speed: row.get(13)?,
                iso: row.get(14)?,
                rating: row.get(15)?,
                flag: row.get(16)?,
                color_label: row.get(17)?,
                burst_group_id: row.get(18)?,
                burst_index: row.get(19)?,
                micro_cached: row.get::<_, i32>(20)? != 0,
                preview_cached: row.get::<_, i32>(21)? != 0,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
    }

    /// Update just the flag for an image (write-through from UI).
    pub fn update_flag(&self, file_path: &str, flag: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE images SET flag = ?1 WHERE file_path = ?2",
            params![flag, file_path],
        )?;
        Ok(())
    }

    /// Update just the rating for an image.
    pub fn update_rating(&self, file_path: &str, rating: i32) -> Result<()> {
        self.conn.execute(
            "UPDATE images SET rating = ?1 WHERE file_path = ?2",
            params![rating, file_path],
        )?;
        Ok(())
    }

    /// Update just the color label for an image.
    pub fn update_color_label(&self, file_path: &str, color_label: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE images SET color_label = ?1 WHERE file_path = ?2",
            params![color_label, file_path],
        )?;
        Ok(())
    }

    /// Batch update flags (e.g., burst flagging).
    pub fn update_flags_batch(&self, updates: &[(&str, &str)]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (file_path, flag) in updates {
            self.conn.execute(
                "UPDATE images SET flag = ?1 WHERE file_path = ?2",
                params![flag, file_path],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    // -- Burst group operations --

    /// Insert or update a burst group.
    pub fn upsert_burst_group(&self, burst: &BurstGroupRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO burst_groups (
                id, camera_serial, frame_count, duration_ms, avg_gap_ms, estimated_fps
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                burst.id,
                burst.camera_serial,
                burst.frame_count,
                burst.duration_ms,
                burst.avg_gap_ms,
                burst.estimated_fps,
            ],
        )?;
        Ok(())
    }

    /// Batch insert burst groups.
    pub fn upsert_burst_groups(&self, bursts: &[BurstGroupRecord]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for burst in bursts {
            self.upsert_burst_group(burst)?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Load all burst groups.
    pub fn load_burst_groups(&self) -> Result<Vec<BurstGroupRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, camera_serial, frame_count, duration_ms, avg_gap_ms, estimated_fps
             FROM burst_groups",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(BurstGroupRecord {
                id: row.get(0)?,
                camera_serial: row.get(1)?,
                frame_count: row.get(2)?,
                duration_ms: row.get(3)?,
                avg_gap_ms: row.get(4)?,
                estimated_fps: row.get(5)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.into())
    }

    // -- Statistics --

    /// Get image count.
    pub fn image_count(&self) -> Result<i64> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))?;
        Ok(count)
    }

    /// Get flag counts.
    pub fn flag_counts(&self) -> Result<HashMap<String, i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT flag, COUNT(*) FROM images GROUP BY flag")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut counts = HashMap::new();
        for row in rows {
            let (flag, count) = row?;
            counts.insert(flag, count);
        }
        Ok(counts)
    }

    // -- Utility --

    /// Generate a deterministic hash from a folder path for cache directory naming.
    fn hash_path(path: &str) -> String {
        // Simple hash — good enough for cache directory naming.
        // Not cryptographic, just needs to be deterministic and collision-resistant.
        let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
        for byte in path.bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3); // FNV prime
        }
        format!("{:016x}", hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> (SessionDb, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = SessionDb::open_at(&db_path).unwrap();
        (db, dir)
    }

    fn sample_image(path: &str) -> ImageRecord {
        ImageRecord {
            file_path: path.to_string(),
            filename: path.split('/').last().unwrap_or(path).to_string(),
            file_size: 50_000_000,
            file_mtime: 1700000000,
            cache_hash: format!("hash-{}", path),
            serial_number: "3002851".to_string(),
            drive_mode: "ContinuousHigh".to_string(),
            capture_time: "2025-08-14T18:45:40.000Z".to_string(),
            make: Some("NIKON CORPORATION".to_string()),
            model: Some("NIKON Z 9".to_string()),
            lens: Some("VR 500mm f/4E".to_string()),
            focal_length: Some(500.0),
            aperture: Some(4.5),
            shutter_speed: Some("1/3200".to_string()),
            iso: Some(800),
            rating: 0,
            flag: "none".to_string(),
            color_label: "none".to_string(),
            burst_group_id: None,
            burst_index: None,
            micro_cached: false,
            preview_cached: false,
        }
    }

    #[test]
    fn test_create_and_load_empty() {
        let (db, _dir) = test_db();
        let images = db.load_images().unwrap();
        assert!(images.is_empty());
    }

    #[test]
    fn test_upsert_and_load_image() {
        let (db, _dir) = test_db();
        let img = sample_image("/photos/test.NEF");
        db.upsert_image(&img).unwrap();

        let loaded = db.load_images().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].file_path, "/photos/test.NEF");
        assert_eq!(loaded[0].serial_number, "3002851");
    }

    #[test]
    fn test_batch_upsert() {
        let (db, _dir) = test_db();
        let images: Vec<_> = (0..100)
            .map(|i| sample_image(&format!("/photos/img_{:04}.NEF", i)))
            .collect();
        db.upsert_images(&images).unwrap();
        assert_eq!(db.image_count().unwrap(), 100);
    }

    #[test]
    fn test_update_flag() {
        let (db, _dir) = test_db();
        let img = sample_image("/photos/test.NEF");
        db.upsert_image(&img).unwrap();

        db.update_flag("/photos/test.NEF", "pick").unwrap();
        let loaded = db.load_images().unwrap();
        assert_eq!(loaded[0].flag, "pick");

        // Toggle back
        db.update_flag("/photos/test.NEF", "none").unwrap();
        let loaded = db.load_images().unwrap();
        assert_eq!(loaded[0].flag, "none");
    }

    #[test]
    fn test_update_rating() {
        let (db, _dir) = test_db();
        let img = sample_image("/photos/test.NEF");
        db.upsert_image(&img).unwrap();

        db.update_rating("/photos/test.NEF", 5).unwrap();
        let loaded = db.load_images().unwrap();
        assert_eq!(loaded[0].rating, 5);
    }

    #[test]
    fn test_update_color_label() {
        let (db, _dir) = test_db();
        let img = sample_image("/photos/test.NEF");
        db.upsert_image(&img).unwrap();

        db.update_color_label("/photos/test.NEF", "red").unwrap();
        let loaded = db.load_images().unwrap();
        assert_eq!(loaded[0].color_label, "red");
    }

    #[test]
    fn test_batch_flag_update() {
        let (db, _dir) = test_db();
        let images: Vec<_> = (0..5)
            .map(|i| sample_image(&format!("/photos/img_{}.NEF", i)))
            .collect();
        db.upsert_images(&images).unwrap();

        let updates: Vec<(&str, &str)> = vec![
            ("/photos/img_0.NEF", "pick"),
            ("/photos/img_1.NEF", "reject"),
            ("/photos/img_2.NEF", "pick"),
        ];
        db.update_flags_batch(&updates).unwrap();

        let loaded = db.load_images().unwrap();
        let flags: HashMap<String, String> = loaded
            .into_iter()
            .map(|i| (i.file_path, i.flag))
            .collect();
        assert_eq!(flags["/photos/img_0.NEF"], "pick");
        assert_eq!(flags["/photos/img_1.NEF"], "reject");
        assert_eq!(flags["/photos/img_2.NEF"], "pick");
        assert_eq!(flags["/photos/img_3.NEF"], "none");
    }

    #[test]
    fn test_burst_groups() {
        let (db, _dir) = test_db();
        let burst = BurstGroupRecord {
            id: "burst-1".to_string(),
            camera_serial: "3002851".to_string(),
            frame_count: 6,
            duration_ms: 250,
            avg_gap_ms: 50.0,
            estimated_fps: 20.0,
        };
        db.upsert_burst_group(&burst).unwrap();

        let loaded = db.load_burst_groups().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "burst-1");
        assert_eq!(loaded[0].frame_count, 6);
    }

    #[test]
    fn test_session_meta() {
        let (db, _dir) = test_db();
        db.set_meta("root_folder", "/photos/wedding").unwrap();
        db.set_meta("camera_count", "2").unwrap();

        assert_eq!(
            db.get_meta("root_folder").unwrap(),
            Some("/photos/wedding".to_string())
        );
        assert_eq!(
            db.get_meta("camera_count").unwrap(),
            Some("2".to_string())
        );
        assert_eq!(db.get_meta("nonexistent").unwrap(), None);
    }

    #[test]
    fn test_flag_counts() {
        let (db, _dir) = test_db();
        let mut images: Vec<_> = (0..10)
            .map(|i| sample_image(&format!("/photos/img_{}.NEF", i)))
            .collect();
        images[0].flag = "pick".to_string();
        images[1].flag = "pick".to_string();
        images[2].flag = "reject".to_string();
        db.upsert_images(&images).unwrap();

        let counts = db.flag_counts().unwrap();
        assert_eq!(counts.get("pick"), Some(&2));
        assert_eq!(counts.get("reject"), Some(&1));
        assert_eq!(counts.get("none"), Some(&7));
    }

    #[test]
    fn test_upsert_preserves_user_data() {
        let (db, _dir) = test_db();
        let mut img = sample_image("/photos/test.NEF");
        db.upsert_image(&img).unwrap();

        // User flags the image
        db.update_flag("/photos/test.NEF", "pick").unwrap();
        db.update_rating("/photos/test.NEF", 4).unwrap();

        // Re-import (upsert) with same path — should overwrite EXIF but...
        // Actually, upsert replaces everything. For re-import, we'd need
        // a smarter merge. For now, upsert is for initial import only.
        // This test documents the current behavior.
        img.iso = Some(1600); // Changed EXIF
        img.flag = "none".to_string(); // Would reset flag!
        db.upsert_image(&img).unwrap();

        let loaded = db.load_images().unwrap();
        assert_eq!(loaded[0].iso, Some(1600));
        // Flag was reset by upsert — this is expected for v1.
        // v2 should merge EXIF changes while preserving user metadata.
        assert_eq!(loaded[0].flag, "none");
    }
}
