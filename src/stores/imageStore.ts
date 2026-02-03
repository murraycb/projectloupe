import { create } from 'zustand';
import {
  ImageEntry,
  BurstGroupData,
  CameraGroup,
  FilterState,
  OverlayMode,
  ImportResult,
  ImagePayload,
  BurstPayload,
} from '../types';

// Conditional Tauri import — falls back to mock when running in browser
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let openDialog: ((options: Record<string, unknown>) => Promise<string | null>) | null = null;

// Lazy-load Tauri APIs (they throw outside Tauri runtime)
async function loadTauriApis() {
  try {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
    const dialog = await import('@tauri-apps/plugin-dialog');
    openDialog = dialog.open as any;
  } catch {
    // Running in browser — Tauri APIs unavailable
    console.info('Tauri APIs not available, using mock mode');
  }
}
loadTauriApis();

interface ImageStore {
  // State
  images: ImageEntry[];
  burstGroups: BurstGroupData[];
  cameras: CameraGroup[];
  selectedIds: Set<string>;
  expandedBursts: Set<string>;
  filters: FilterState;
  overlayMode: OverlayMode;
  isImporting: boolean;
  importError: string | null;
  folderPath: string | null;

  // Actions — image metadata
  setRating: (imageId: string, rating: number) => void;
  setFlag: (imageId: string, flag: 'none' | 'pick' | 'reject') => void;
  setColorLabel: (imageId: string, label: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple') => void;

  // Actions — selection
  toggleSelection: (imageId: string) => void;
  selectRange: (startId: string, endId: string) => void;
  clearSelection: () => void;

  // Actions — bursts
  toggleBurstExpand: (burstId: string) => void;

  // Actions — filters
  setFilter: (filterKey: keyof FilterState, value: any) => void;
  clearFilters: () => void;

  // Actions — import
  importFolder: () => Promise<void>;
  importMock: () => Promise<void>;

  // Actions — display
  cycleOverlayMode: () => void;
}

const overlayModes: OverlayMode[] = ['none', 'minimal', 'standard', 'full'];

// Convert backend payload to frontend ImageEntry
function payloadToEntry(img: ImagePayload, burstId: string | null, burstIndex: number | null): ImageEntry {
  const ts = new Date(img.capture_time).getTime();
  // Generate deterministic color from filename for placeholder
  let hash = 0;
  for (let i = 0; i < img.filename.length; i++) {
    hash = ((hash << 5) - hash + img.filename.charCodeAt(i)) | 0;
  }

  return {
    id: img.file_path, // file path as unique ID
    filename: img.filename,
    path: img.file_path,
    timestamp: ts,
    captureTime: img.capture_time,
    serialNumber: img.serial_number,
    driveMode: img.drive_mode,
    exif: {
      iso: img.iso,
      aperture: img.aperture,
      shutterSpeed: img.shutter_speed,
      focalLength: img.focal_length,
      camera: [img.make, img.model].filter(Boolean).join(' ') || 'Unknown',
      lens: img.lens || 'Unknown',
    },
    rating: 0,
    flag: 'none',
    colorLabel: 'none',
    burstGroupId: burstId,
    burstIndex,
    _mockHue: Math.abs(hash) % 360,
    _mockBrightness: 0.3 + (Math.abs(hash >> 8) % 40) / 100,
  };
}

function burstPayloadToGroup(burst: BurstPayload): { group: BurstGroupData; entries: ImageEntry[] } {
  const entries = burst.images.map((img, i) => payloadToEntry(img, burst.id, i));
  const group: BurstGroupData = {
    id: burst.id,
    cameraSerial: burst.camera_serial,
    images: entries,
    frameCount: burst.frame_count,
    durationMs: burst.duration_ms,
    avgGapMs: burst.avg_gap_ms,
    estimatedFps: burst.estimated_fps,
    expanded: false,
  };
  return { group, entries };
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  burstGroups: [],
  cameras: [],
  selectedIds: new Set(),
  expandedBursts: new Set(),
  overlayMode: 'minimal',
  isImporting: false,
  importError: null,
  folderPath: null,
  filters: {
    minRating: 0,
    flags: new Set(),
    colorLabels: new Set(),
    showBurstsOnly: false,
    cameraSerial: null,
  },

  setRating: (imageId, rating) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, rating } : img
      ),
    }));
  },

  setFlag: (imageId, flag) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, flag } : img
      ),
    }));
  },

  setColorLabel: (imageId, label) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, colorLabel: label } : img
      ),
    }));
  },

  toggleSelection: (imageId) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(imageId)) {
        newSelectedIds.delete(imageId);
      } else {
        newSelectedIds.add(imageId);
      }
      return { selectedIds: newSelectedIds };
    });
  },

  selectRange: (startId, endId) => {
    const { images, selectedIds } = get();
    const startIndex = images.findIndex((img) => img.id === startId);
    const endIndex = images.findIndex((img) => img.id === endId);
    if (startIndex === -1 || endIndex === -1) return;
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    const newSelectedIds = new Set(selectedIds);
    for (let i = min; i <= max; i++) newSelectedIds.add(images[i].id);
    set({ selectedIds: newSelectedIds });
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  toggleBurstExpand: (burstId) => {
    set((state) => {
      const newExpandedBursts = new Set(state.expandedBursts);
      if (newExpandedBursts.has(burstId)) newExpandedBursts.delete(burstId);
      else newExpandedBursts.add(burstId);
      return { expandedBursts: newExpandedBursts };
    });
  },

  setFilter: (filterKey, value) => {
    set((state) => ({ filters: { ...state.filters, [filterKey]: value } }));
  },

  clearFilters: () => {
    set({
      filters: {
        minRating: 0,
        flags: new Set(),
        colorLabels: new Set(),
        showBurstsOnly: false,
        cameraSerial: null,
      },
    });
  },

  importFolder: async () => {
    set({ isImporting: true, importError: null });

    try {
      // Use Tauri dialog to pick folder
      if (!openDialog || !invoke) {
        // Fallback: try loading again
        await loadTauriApis();
      }

      if (!openDialog || !invoke) {
        throw new Error('Tauri APIs not available. Use mock import for browser testing.');
      }

      const selectedPath = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select photo folder',
      });

      if (!selectedPath) {
        set({ isImporting: false });
        return; // User cancelled
      }

      const folderPath = typeof selectedPath === 'string' ? selectedPath : (selectedPath as string[])[0];

      // Call Tauri backend
      const response = await invoke('import_folder', {
        request: { folder_path: folderPath },
      }) as ImportResult;

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Import failed');
      }

      const data = response.result;

      // Convert burst images
      const allImages: ImageEntry[] = [];
      const burstGroups: BurstGroupData[] = [];

      for (const burst of data.bursts) {
        const { group, entries } = burstPayloadToGroup(burst);
        burstGroups.push(group);
        allImages.push(...entries);
      }

      // Convert single images
      for (const single of data.singles) {
        allImages.push(payloadToEntry(single, null, null));
      }

      // Sort all images by timestamp
      allImages.sort((a, b) => a.timestamp - b.timestamp);

      const cameras: CameraGroup[] = data.cameras.map((c) => ({
        serial: c.serial,
        make: c.make,
        model: c.model,
        imageCount: c.image_count,
        burstCount: c.burst_count,
      }));

      set({
        images: allImages,
        burstGroups,
        cameras,
        folderPath,
        isImporting: false,
        importError: null,
        selectedIds: new Set(),
        expandedBursts: new Set(),
      });
    } catch (err: any) {
      set({
        isImporting: false,
        importError: err.message || 'Unknown import error',
      });
    }
  },

  // Mock import for browser dev
  importMock: async () => {
    const { generateMockImages } = await import('../mock/generateMockData');
    set({ images: generateMockImages(), isImporting: false, importError: null });
  },

  cycleOverlayMode: () => {
    set((state) => {
      const idx = overlayModes.indexOf(state.overlayMode);
      return { overlayMode: overlayModes[(idx + 1) % overlayModes.length] };
    });
  },
}));
