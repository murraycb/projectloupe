export interface ImageEntry {
  id: string;
  filename: string;
  path: string;
  timestamp: number; // unix ms
  exif: {
    iso: number;
    aperture: number;
    shutterSpeed: string;
    focalLength: number;
    camera: string;
    lens: string;
  };
  rating: number;
  flag: 'none' | 'pick' | 'reject';
  colorLabel: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';
  burstGroupId: string | null;
  burstIndex: number | null;
  _mockHue?: number;
  _mockBrightness?: number;
}

export interface BurstGroupData {
  id: string;
  images: ImageEntry[];
  expanded: boolean;
}

export type FilterState = {
  minRating: number;
  flags: Set<string>;
  colorLabels: Set<string>;
  showBurstsOnly: boolean;
};

export type OverlayMode = 'none' | 'minimal' | 'standard' | 'full';
