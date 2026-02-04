//! Viewport-aware prefetch scheduler for background thumbnail generation
//!
//! This module provides intelligent prefetching of thumbnails based on viewport
//! position, generating thumbnails for visible items first and expanding outward.
//! Work can be cancelled when the viewport changes.

use crate::cache::ThumbnailCache;
use crate::generate::ThumbnailTier;
use anyhow::Result;
use rayon::prelude::*;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// Represents a prefetch job for a specific tier and file list
#[derive(Debug, Clone)]
pub struct PrefetchJob {
    pub file_paths: Vec<String>,
    pub tier: ThumbnailTier,
    pub viewport_start: usize,
    pub viewport_end: usize,
}

/// Progress information for a prefetch job
#[derive(Debug, Clone)]
pub struct PrefetchProgress {
    pub total_files: usize,
    pub completed_files: usize,
    pub failed_files: usize,
    pub viewport_completed: usize,
    pub viewport_total: usize,
    pub is_cancelled: bool,
    pub is_finished: bool,
}

impl PrefetchProgress {
    pub fn completion_percentage(&self) -> f64 {
        if self.total_files == 0 {
            100.0
        } else {
            (self.completed_files as f64 / self.total_files as f64) * 100.0
        }
    }

    pub fn viewport_completion_percentage(&self) -> f64 {
        if self.viewport_total == 0 {
            100.0
        } else {
            (self.viewport_completed as f64 / self.viewport_total as f64) * 100.0
        }
    }
}

/// Background prefetch scheduler for thumbnails
pub struct PrefetchScheduler {
    cache: Arc<ThumbnailCache>,
    current_job: Arc<Mutex<Option<PrefetchJobHandle>>>,
}

struct PrefetchJobHandle {
    cancel_flag: Arc<AtomicBool>,
    progress: Arc<Mutex<PrefetchProgress>>,
    thread_handle: Option<thread::JoinHandle<Result<()>>>,
}

impl PrefetchScheduler {
    /// Create a new prefetch scheduler
    pub fn new(cache: Arc<ThumbnailCache>) -> Self {
        Self {
            cache,
            current_job: Arc::new(Mutex::new(None)),
        }
    }

    /// Start prefetching thumbnails for the given job
    /// Cancels any existing prefetch job
    pub fn start_prefetch(&self, job: PrefetchJob) -> Result<()> {
        // Cancel existing job if any
        self.cancel_current_job();

        let total_files = job.file_paths.len();
        let viewport_total = if job.viewport_end > job.viewport_start {
            job.viewport_end - job.viewport_start
        } else {
            0
        };

        let progress = Arc::new(Mutex::new(PrefetchProgress {
            total_files,
            completed_files: 0,
            failed_files: 0,
            viewport_completed: 0,
            viewport_total,
            is_cancelled: false,
            is_finished: false,
        }));

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let cache = Arc::clone(&self.cache);

        let progress_clone = Arc::clone(&progress);
        let cancel_flag_clone = Arc::clone(&cancel_flag);

        // Spawn background thread for prefetching
        let thread_handle = thread::spawn(move || {
            Self::execute_prefetch_job(cache, job, progress_clone, cancel_flag_clone)
        });

        let job_handle = PrefetchJobHandle {
            cancel_flag,
            progress,
            thread_handle: Some(thread_handle),
        };

        *self.current_job.lock().unwrap() = Some(job_handle);

        Ok(())
    }

    /// Cancel the current prefetch job
    pub fn cancel_current_job(&self) {
        let mut current_job = self.current_job.lock().unwrap();
        if let Some(mut job_handle) = current_job.take() {
            job_handle.cancel_flag.store(true, Ordering::Relaxed);
            
            // Mark as cancelled in progress
            if let Ok(mut progress) = job_handle.progress.lock() {
                progress.is_cancelled = true;
            }

            // Wait for thread to finish (with timeout to avoid hanging)
            if let Some(handle) = job_handle.thread_handle.take() {
                // Don't wait indefinitely - let the thread finish on its own
                let _ = handle.join();
            }
        }
    }

    /// Get progress of the current prefetch job
    pub fn get_progress(&self) -> Option<PrefetchProgress> {
        let current_job = self.current_job.lock().unwrap();
        if let Some(job_handle) = current_job.as_ref() {
            if let Ok(progress) = job_handle.progress.lock() {
                return Some(progress.clone());
            }
        }
        None
    }

    /// Check if a prefetch job is currently running
    pub fn is_running(&self) -> bool {
        let current_job = self.current_job.lock().unwrap();
        if let Some(job_handle) = current_job.as_ref() {
            if let Ok(progress) = job_handle.progress.lock() {
                return !progress.is_finished && !progress.is_cancelled;
            }
        }
        false
    }

    /// Execute a prefetch job in priority order (viewport first, then expanding outward)
    fn execute_prefetch_job(
        cache: Arc<ThumbnailCache>,
        job: PrefetchJob,
        progress: Arc<Mutex<PrefetchProgress>>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<()> {
        let file_paths = job.file_paths;
        let tier = job.tier;
        let viewport_start = job.viewport_start.min(file_paths.len());
        let viewport_end = job.viewport_end.min(file_paths.len());

        // Create priority-ordered list: viewport items first, then everything else
        let mut priority_order = Vec::new();
        
        // Add viewport items first
        for i in viewport_start..viewport_end {
            if i < file_paths.len() {
                priority_order.push((i, true)); // true = in viewport
            }
        }

        // Add non-viewport items in expanding rings
        let viewport_center = (viewport_start + viewport_end) / 2;
        let mut before_items = Vec::new();
        let mut after_items = Vec::new();

        for i in 0..viewport_start {
            before_items.push((viewport_start - 1 - i, false));
        }
        for i in viewport_end..file_paths.len() {
            after_items.push((i, false));
        }

        // Interleave before/after items to expand outward from viewport
        let mut before_iter = before_items.into_iter();
        let mut after_iter = after_items.into_iter();
        loop {
            let mut added = false;
            if let Some(item) = before_iter.next() {
                priority_order.push(item);
                added = true;
            }
            if let Some(item) = after_iter.next() {
                priority_order.push(item);
                added = true;
            }
            if !added {
                break;
            }
        }

        // Process items in priority order
        let completed = AtomicUsize::new(0);
        let failed = AtomicUsize::new(0);
        let viewport_completed = AtomicUsize::new(0);

        // Use a smaller chunk size for more responsive cancellation
        let chunk_size = 4;
        let chunks: Vec<_> = priority_order.chunks(chunk_size).collect();

        for chunk in chunks {
            // Check for cancellation before processing each chunk
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }

            // Process chunk in parallel
            chunk.par_iter().for_each(|(index, is_viewport)| {
                // Check for cancellation before each item
                if cancel_flag.load(Ordering::Relaxed) {
                    return;
                }

                let file_path = &file_paths[*index];
                match cache.get_or_generate(file_path, tier) {
                    Ok(_) => {
                        completed.fetch_add(1, Ordering::Relaxed);
                        if *is_viewport {
                            viewport_completed.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to generate thumbnail for {}: {}", file_path, e);
                        failed.fetch_add(1, Ordering::Relaxed);
                    }
                }

                // Update progress
                if let Ok(mut progress_guard) = progress.lock() {
                    progress_guard.completed_files = completed.load(Ordering::Relaxed);
                    progress_guard.failed_files = failed.load(Ordering::Relaxed);
                    progress_guard.viewport_completed = viewport_completed.load(Ordering::Relaxed);
                }
            });

            // Small delay between chunks to make cancellation more responsive
            thread::sleep(Duration::from_millis(10));
        }

        // Mark as finished
        if let Ok(mut progress_guard) = progress.lock() {
            progress_guard.is_finished = true;
            if !cancel_flag.load(Ordering::Relaxed) {
                progress_guard.completed_files = completed.load(Ordering::Relaxed);
                progress_guard.failed_files = failed.load(Ordering::Relaxed);
                progress_guard.viewport_completed = viewport_completed.load(Ordering::Relaxed);
            }
        }

        Ok(())
    }
}

impl Drop for PrefetchScheduler {
    fn drop(&mut self) {
        self.cancel_current_job();
    }
}

/// Convenience function to create a prefetch job for a viewport
pub fn create_viewport_prefetch_job(
    file_paths: Vec<String>,
    tier: ThumbnailTier,
    viewport_start: usize,
    viewport_size: usize,
) -> PrefetchJob {
    let viewport_end = (viewport_start + viewport_size).min(file_paths.len());
    
    PrefetchJob {
        file_paths,
        tier,
        viewport_start,
        viewport_end,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::ThumbnailCache;
    use std::sync::Arc;

    #[test]
    fn test_prefetch_job_creation() {
        let file_paths = vec![
            "file1.jpg".to_string(),
            "file2.jpg".to_string(),
            "file3.jpg".to_string(),
            "file4.jpg".to_string(),
            "file5.jpg".to_string(),
        ];

        let job = create_viewport_prefetch_job(
            file_paths.clone(),
            ThumbnailTier::Micro,
            1,
            2
        );

        assert_eq!(job.file_paths, file_paths);
        assert_eq!(job.tier, ThumbnailTier::Micro);
        assert_eq!(job.viewport_start, 1);
        assert_eq!(job.viewport_end, 3);
    }

    #[test]
    fn test_viewport_bounds() {
        let file_paths = vec![
            "file1.jpg".to_string(),
            "file2.jpg".to_string(),
        ];

        // Test viewport larger than file list
        let job = create_viewport_prefetch_job(
            file_paths.clone(),
            ThumbnailTier::Micro,
            0,
            10
        );

        assert_eq!(job.viewport_end, 2); // Should be clamped to file_paths.len()
    }

    #[test]
    fn test_progress_calculations() {
        let progress = PrefetchProgress {
            total_files: 100,
            completed_files: 25,
            failed_files: 5,
            viewport_completed: 8,
            viewport_total: 10,
            is_cancelled: false,
            is_finished: false,
        };

        assert_eq!(progress.completion_percentage(), 25.0);
        assert_eq!(progress.viewport_completion_percentage(), 80.0);
    }

    #[test]
    fn test_scheduler_creation() -> Result<()> {
        let cache = Arc::new(ThumbnailCache::new("test_prefetch")?);
        let scheduler = PrefetchScheduler::new(cache);
        
        assert!(!scheduler.is_running());
        assert!(scheduler.get_progress().is_none());
        
        Ok(())
    }

    #[test]
    fn test_cancel_functionality() -> Result<()> {
        let cache = Arc::new(ThumbnailCache::new("test_cancel")?);
        let scheduler = PrefetchScheduler::new(cache);
        
        // Start a job
        let job = PrefetchJob {
            file_paths: vec!["nonexistent1.jpg".to_string(), "nonexistent2.jpg".to_string()],
            tier: ThumbnailTier::Micro,
            viewport_start: 0,
            viewport_end: 1,
        };
        
        scheduler.start_prefetch(job)?;
        
        // Cancel immediately
        scheduler.cancel_current_job();
        
        // Should be marked as cancelled
        if let Some(progress) = scheduler.get_progress() {
            assert!(progress.is_cancelled);
        }
        
        Ok(())
    }
}