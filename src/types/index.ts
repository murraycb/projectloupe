/**
 * Type definitions for ProjectLoupe.
 *
 * Two layers of types:
 * 1. Backend payloads (snake_case) — match Rust serde serialization from Tauri commands.
 *    These are the raw JSON shapes returned by invoke().
 * 2. Frontend types (camelCase) — used by React components and the Zustand store.
 *    Converted from payloads in imageStore.ts via payloadToEntry()/burstPayloadToGroup().
 *
 * This separation keeps the Rust↔TS contract explicit and insulates the UI from
 * backend serialization changes.
 */

// -- Backend payload types (from Tauri commands) --

export interface ImagePayload {
  file_path: string;
  filename: string;
  serial_number: string;
  drive_mode: string; // "Single" | "ContinuousLow" | "ContinuousHigh" | "Unknown"
  capture_time: string; // ISO 8601
  make: string | null;
  model: string | null;
  lens: string | null;
  focal_length: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
}

export interface BurstPayload {
  id: string;
  camera_serial: string;
  frame_count: number;
  duration_ms: number;
  avg_gap_ms: number;
  estimated_fps: number;
  images: ImagePayload[];
}

export interface CameraPayload {
  serial: string;
  make: string;
  model: string;
  image_count: number;
  burst_count: number;
}

export interface BurstResultPayload {
  total_images: number;
  total_bursts: number;
  total_singles: number;
  cameras: CameraPayload[];
  bursts: BurstPayload[];
  singles: ImagePayload[];
}

export interface ImportResult {
  success: boolean;
  result?: BurstResultPayload;
  error?: string;
}

// -- Frontend display types --

export interface ImageEntry {
  id: string;
  filename: string;
  path: string;
  timestamp: number; // unix ms
  captureTime: string; // ISO 8601 for display
  serialNumber: string;
  driveMode: string;
  exif: {
    iso: number | null;
    aperture: number | null;
    shutterSpeed: string | null;
    focalLength: number | null;
    camera: string;
    lens: string;
  };
  rating: number;
  flag: 'none' | 'pick' | 'reject';
  colorLabel: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';
  burstGroupId: string | null;
  burstIndex: number | null;
  // Progressive thumbnails
  colorSwatch?: string;           // hex color from backend (e.g., "#ff8040")
  microThumbnailUrl?: string;     // asset:// URL for 300px micro thumbnail
  previewThumbnailUrl?: string;   // asset:// URL for 1600px preview
  thumbnailTier?: 'swatch' | 'micro' | 'preview' | 'loupe';  // highest loaded tier
  // Legacy thumbnail (v1) - kept for backward compatibility
  thumbnailPath?: string;    // local file path to cached thumbnail
  thumbnailUrl?: string;     // asset:// URL for rendering
  // Placeholder colors (used when no thumbnail yet)
  _placeholderHue?: number;
  _placeholderBrightness?: number;
}

/**
 * Burst group with embedded image copies.
 * @deprecated Use NormalizedBurstGroup with imageIds instead.
 * Kept temporarily during incremental migration.
 */
export interface BurstGroupData {
  id: string;
  cameraSerial: string;
  images: ImageEntry[];
  frameCount: number;
  durationMs: number;
  avgGapMs: number;
  estimatedFps: number;
  expanded: boolean;
}

/** Normalized burst group — references images by ID instead of embedding copies. */
export interface NormalizedBurstGroup {
  id: string;
  cameraSerial: string;
  imageIds: string[];
  frameCount: number;
  durationMs: number;
  avgGapMs: number;
  estimatedFps: number;
}

export interface CameraGroup {
  serial: string;
  make: string;
  model: string;
  imageCount: number;
  burstCount: number;
}

export type FilterState = {
  minRating: number;
  flags: Set<string>;
  colorLabels: Set<string>;
  showBurstsOnly: boolean;
  cameraSerial: string | null; // filter to specific camera
};

export type OverlayMode = 'none' | 'minimal' | 'standard' | 'full';

// Loupe view state
export interface LoupeState {
  active: boolean;
  imageId: string | null;         // current image being viewed
  burstId: string | null;         // if viewing a burst, the burst ID (locks navigation to burst)
  loupeUrls: Record<string, string>;  // file path → asset URL for full-res images
}
