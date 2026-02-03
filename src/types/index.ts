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
  // Mock placeholders (used when no real thumbnail)
  _mockHue?: number;
  _mockBrightness?: number;
}

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
