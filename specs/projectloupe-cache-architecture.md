# ProjectLoupe — Cache & Thumbnail Architecture

## Problem Statement

Professional shoots produce 2,000–10,000+ RAW files (25–60MB each). A photo culling app lives or dies by scroll performance. Every visible thumbnail must be ready before the frame renders. Decoding RAW on-the-fly is not an option.

Photo Mechanic's entire reputation is "fastest browser on the planet." That's our bar.

## Design Principles

1. **Never block the UI thread** — all decoding in Rust/workers
2. **Show something immediately** — progressive: color swatch → micro thumb → preview
3. **Pay the cost once** — import-time extraction, cached to disk
4. **Prefetch ahead of the viewport** — user should never see a loading state during normal scrolling
5. **Degrade gracefully under speed** — fast scrubbing drops to swatches, thumbnails fill in when velocity drops

---

## Thumbnail Tiers

| Tier | Target Size | Source | When Generated | Storage | Typical Size |
|------|------------|--------|---------------|---------|-------------|
| Color swatch | 1×1 avg color | EXIF or first pixel | EXIF extraction | SQLite (inline) | 3 bytes |
| Micro | 200–300px long edge | Embedded JPEG, downscaled | Import batch | Disk file + memory LRU | 10–25KB |
| Preview | 1600px long edge | Embedded JPEG | On demand + prefetch | Disk file | 100–300KB |
| Full | Native resolution | RAW decode (dcraw/libraw) | Loupe view only | Memory LRU, evict aggressively | 5–30MB decoded |

### Why these sizes?

- **Micro (200–300px):** Grid view shows thumbnails at ~200px wide. 300px gives us room for 1.5x retina without a second tier. At JPEG quality 80, these are tiny.
- **Preview (1600px):** Fills a 1440p monitor. Good enough for flagging/rating decisions. Only needed when an image is selected or in loupe view.
- **Full:** Only for pixel-peeping (sharpness check, 100% crop). One or two in memory at a time, max.

---

## Cache Directory Structure

```
~/.projectloupe/
  cache/
    {session-hash}/
      meta.db              # SQLite: EXIF, ratings, flags, color labels, burst groups
      micro/               # Micro thumbnails
        {file-hash}.jpg
      preview/             # Preview thumbnails  
        {file-hash}.jpg
```

### Cache Key

Files are identified by `(absolute_path, file_size_bytes, modified_time_ms)`. A hash of this triple becomes the filename in cache directories.

If any component changes (file moved, edited, re-exported), the cache entry is stale and re-extracted.

### Session Hash

Derived from the session's root folder path. Allows multiple sessions to coexist without collision.

---

## Import Pipeline

Import is the one-time cost. Must be parallelized and progressive.

```
Phase 1: Discovery
  Scan folder recursively for supported extensions
  → Yield file list to UI immediately (show count, enable cancel)

Phase 2a: First Viewport — Single Pass (priority batch)
  For the first ~50 images (visible viewport):
    Single exiftool call extracts EXIF + embedded JPEG together
    → Decode + downscale to micro thumbnail immediately
    → Store EXIF in SQLite, write micro to disk
    → UI shows real thumbnails within seconds

Phase 2b: Remaining Files — Two Pass
  Pass 1: EXIF only (parallelized, exiftool -stay_open -fast2)
    → Extract metadata + color swatch for ALL remaining files
    → Store in SQLite
    → UI shows color swatches + filenames for full grid
    → Burst detection runs as soon as all EXIF is in
  
  Pass 2: Embedded JPEG extraction (parallelized, rayon)
    For each remaining file:
      1. Extract embedded JPEG (exiftool -b -PreviewImage/-JpgFromRaw)
      2. Decode JPEG (turbojpeg)
      3. Downscale to micro size (turbojpeg scale or Lanczos)
      4. Encode to JPEG quality 80
      5. Write to cache/micro/{hash}.jpg
    → UI swaps color swatches for real thumbnails progressively
    → Priority: nearest to viewport first, then outward

Phase 3: Preview Generation (lazy / on-demand)
  Same as micro but at 1600px
  Generated when:
    - User selects an image
    - Prefetch window includes the image
  NOT generated at import time (too slow for initial load)
```

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| EXIF extraction | ~2ms/file | exiftool -fast2, specific tags only |
| Embedded JPEG extraction | ~10ms/file | exiftool -b |
| Micro thumbnail generation | ~5ms/file | turbojpeg decode+resize |
| Total import (5,000 files, 8 cores) | < 30 seconds | Phases 1-3 |
| Time to first thumbnail | < 3 seconds | Phase 1 + first batch of phase 2/3 |
| Grid usable (swatches + names) | < 5 seconds | Phase 2 completion |

---

## Memory LRU Strategy

### Micro Thumbnails

- **Budget:** 150MB (configurable)
- **At 20KB average:** ~7,500 thumbnails in memory
- **For most shoots:** entire session fits in LRU — no eviction needed
- **For mega shoots (10K+):** LRU evicts oldest-accessed, prefetch refills as viewport moves
- **Implementation:** `HashMap<CacheKey, Arc<Vec<u8>>>` with LRU eviction in Rust, exposed to frontend via Tauri commands that return `blob:` URLs or base64

### Preview Thumbnails

- **Budget:** 200MB
- **At 200KB average:** ~1,000 previews in memory
- **Eviction:** LRU, more aggressive than micro
- **Prefetch:** Load ±10 images around current selection

### Full Resolution

- **Budget:** 100MB (2-3 decoded images)
- **Only loaded for loupe/100% view**
- **Evict immediately when loupe closes**

---

## Scroll Velocity Adaptation

The virtual scroller tracks scroll velocity (px/ms). Different speeds trigger different rendering strategies:

| Velocity | Strategy |
|----------|----------|
| Stopped / slow (< 2 px/ms) | Full micro thumbnails, prefetch previews for selection |
| Medium (2–10 px/ms) | Micro thumbnails, skip preview prefetch |
| Fast scrub (> 10 px/ms) | Color swatches only, debounce thumbnail loading |
| Scrub stopped | Fill in micro thumbnails for visible viewport, outward |

This prevents the decode pipeline from being overwhelmed during fast scrubbing and keeps the UI at 60fps.

---

## Frontend Integration

### Image Loading Component

```
<ThumbnailImage>
  State 1: Color swatch (CSS background-color, instant)
  State 2: Micro thumbnail loaded (crossfade transition, ~50ms)
  State 3: Preview loaded (only if selected/loupe)
```

### Tauri Commands

```
get_thumbnail(file_hash, tier) → Option<Vec<u8>>
  Returns cached thumbnail bytes, or None if not yet generated

get_thumbnails_batch(file_hashes, tier) → Vec<(hash, Option<Vec<u8>>)>
  Batch fetch for viewport, reduces IPC overhead

prefetch_thumbnails(file_hashes, tier) → ()
  Async: starts generating/loading thumbnails, no response needed

get_import_progress() → { phase, completed, total, current_file }
  Polled by UI for progress display
```

### WebView Considerations

- Tauri's `convertFileSrc` can serve cached files directly as `asset://` URLs — avoids base64 encoding overhead for large images
- For micro thumbnails, base64 data URLs may be faster (avoid file:// security overhead)
- Benchmark both approaches with 200+ visible thumbnails

---

## SQLite Schema (meta.db)

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_mtime INTEGER NOT NULL,
  cache_hash TEXT NOT NULL UNIQUE,
  
  -- EXIF
  serial_number TEXT,
  drive_mode TEXT,
  capture_time TEXT,
  subsec_time TEXT,
  make TEXT,
  model TEXT,
  lens TEXT,
  focal_length REAL,
  aperture REAL,
  shutter_speed TEXT,
  iso INTEGER,
  
  -- Computed
  avg_color TEXT,  -- hex color for swatch
  
  -- User metadata
  rating INTEGER DEFAULT 0,
  flag TEXT DEFAULT 'none',
  color_label TEXT DEFAULT 'none',
  
  -- Burst
  burst_group_id TEXT,
  burst_index INTEGER,
  
  -- Cache state
  micro_cached INTEGER DEFAULT 0,
  preview_cached INTEGER DEFAULT 0,
  
  UNIQUE(file_path, file_size, file_mtime)
);

CREATE INDEX idx_images_burst ON images(burst_group_id);
CREATE INDEX idx_images_serial ON images(serial_number);
CREATE INDEX idx_images_capture ON images(capture_time);
CREATE INDEX idx_images_hash ON images(cache_hash);

CREATE TABLE burst_groups (
  id TEXT PRIMARY KEY,
  camera_serial TEXT NOT NULL,
  frame_count INTEGER NOT NULL,
  duration_ms INTEGER,
  avg_gap_ms REAL,
  estimated_fps REAL
);

CREATE TABLE session_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- e.g., ('root_folder', '/path/to/shoot'), ('created_at', '...'), ('camera_count', '3')
```

---

## Rust Crate Structure

Either extend `burst-detection` or create a new `thumbnail-cache` crate:

```
crates/thumbnail-cache/
  src/
    lib.rs           # Public API
    cache.rs         # Disk cache management (read/write/evict)
    db.rs            # SQLite operations (rusqlite)
    extract.rs       # Embedded JPEG extraction via exiftool
    resize.rs        # Thumbnail generation (turbojpeg/image)
    lru.rs           # In-memory LRU cache
    prefetch.rs      # Viewport-aware prefetch scheduler
    pipeline.rs      # Import pipeline orchestrator
```

### Key Dependencies

- `rusqlite` — SQLite with bundled build
- `turbojpeg` — fast JPEG decode/encode (hardware accelerated)
- `image` — fallback decoder, handles edge cases
- `rayon` — parallel thumbnail generation
- `tokio` — async pipeline orchestration

---

## Decisions (from Open Questions)

1. **Hybrid pass strategy:** Single pass (EXIF + embedded JPEG) for the first visible batch to populate the viewport ASAP. Two-pass for the rest — EXIF first (fast, enables burst detection), then embedded JPEG extraction in a second sweep. Best of both: instant visible thumbnails, fast overall pipeline.

2. **JPEG for thumbnails.** No WebP. Photographers are power users with plenty of storage — thumbnail cache is a rounding error compared to RAW files. JPEG keeps the pipeline simple and turbojpeg gives us hardware-accelerated decode.

3. **Memory-mapped files: v2.** Adds complexity for marginal gain. Standard file I/O with LRU is sufficient for v1.

4. **XMP sidecars: yes, industry standard.** Dual-write: SQLite for fast reads, XMP sidecars for portability (other apps can read our ratings/flags). Optimize write timing — don't write XMP on every keystroke. Batch/debounce writes (e.g., write on deselect, on session close, or after N seconds of inactivity).

5. **Incremental import: defer.** Explore once we're interacting with the UI and can feel the workflow. Likely: re-scan on app focus, diff against SQLite, process only new files.

---

## References

- Photo Mechanic: The gold standard. Pre-extracts everything, keeps thumbnails in memory.
- Lightroom: Generates "smart previews" at import. Slower initial import, fast after.
- FastRawViewer: Uses embedded JPEGs exclusively (no RAW decode for browsing). Very fast.
- Capture One: Session-based, generates previews per session folder.
