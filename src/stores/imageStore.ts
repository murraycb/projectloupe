/**
 * Central state store for ProjectLoupe.
 *
 * Architecture: Zustand store with Tauri backend integration.
 * - Import pipeline: folder dialog → Rust exiftool extraction → burst detection → store hydration
 * - Thumbnails: two-tier cache (PreviewImage 640px for grid, JpgFromRaw 8K for loupe)
 * - Loupe: on-demand full-res extraction, pre-fetches entire burst for smooth scrubbing
 *
 * Flag/rating mutations update both `images[]` and `burstGroups[].images[]`
 * to keep burst-level UI (dimming, cover image, flag indicators) in sync.
 * See `updateImageProp()` helper.
 *
 * Interaction pattern: see specs/projectloupe-interaction-patterns.md
 */
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
  LoupeState,
} from '../types';

// Tauri APIs are loaded dynamically — they throw when running in a regular
// browser (e.g., Vite dev server without Tauri). This lets the frontend code
// compile and partially work in browser for layout/CSS iteration.
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let openDialog: ((options: Record<string, unknown>) => Promise<string | null>) | null = null;
let convertFileSrc: ((path: string) => string) | null = null;

async function loadTauriApis() {
  try {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
    convertFileSrc = tauri.convertFileSrc;
    const dialog = await import('@tauri-apps/plugin-dialog');
    openDialog = dialog.open as any;
  } catch {
    console.info('Tauri APIs not available');
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
  loupe: LoupeState;

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
  importPath: (folderPath: string) => Promise<void>;
  extractThumbnails: () => Promise<void>;

  // Actions — loupe
  openLoupe: (imageId: string) => void;
  closeLoupe: () => void;
  loupeNext: () => void;
  loupePrev: () => void;

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
    _placeholderHue: Math.abs(hash) % 360,
    _placeholderBrightness: 0.3 + (Math.abs(hash >> 8) % 40) / 100,
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

/**
 * Update a property on an image in BOTH `images[]` and `burstGroups[].images[]`.
 *
 * Why dual update? The store maintains two collections: a flat `images[]` array
 * (used for filtering, sorting, global operations) and `burstGroups[].images[]`
 * (used by BurstGroup components for burst-level state like "all rejected" dimming
 * and cover image selection). Without syncing both, flag changes in the loupe
 * wouldn't reflect in the grid's burst stacks.
 */
function updateImageProp(
  state: Pick<ImageStore, 'images' | 'burstGroups'>,
  imageId: string,
  patch: Partial<ImageEntry>,
) {
  const updateImg = (img: ImageEntry) =>
    img.id === imageId ? { ...img, ...patch } : img;

  return {
    images: state.images.map(updateImg),
    burstGroups: state.burstGroups.map((burst) => ({
      ...burst,
      images: burst.images.map(updateImg),
    })),
  };
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
  loupe: { active: false, imageId: null, burstId: null, loupeUrls: {} },
  filters: {
    minRating: 0,
    flags: new Set(),
    colorLabels: new Set(),
    showBurstsOnly: false,
    cameraSerial: null,
  },

  setRating: (imageId, rating) => {
    set((state) => updateImageProp(state, imageId, { rating }));
  },

  setFlag: (imageId, flag) => {
    // Toggle behavior: P on a pick → unflag, X on a reject → unflag.
    // This reduces keystrokes — photographer doesn't need a separate undo key
    // for quick corrections. U is still available as explicit unflag.
    const current = get().images.find((img) => img.id === imageId);
    const newFlag = current && current.flag === flag ? 'none' : flag;
    set((state) => updateImageProp(state, imageId, { flag: newFlag }));
  },

  setColorLabel: (imageId, label) => {
    set((state) => updateImageProp(state, imageId, { colorLabel: label }));
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
        throw new Error('Tauri APIs not available — must run inside Tauri.');
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
      console.log('Selected folder:', folderPath);

      // Call Tauri backend
      const response = await invoke('import_folder', {
        request: { folderPath: folderPath },
      }) as ImportResult;
      console.log('Import response:', response);

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

      // Auto-select first image
      const firstId = allImages.length > 0 ? allImages[0].id : null;

      set({
        images: allImages,
        burstGroups,
        cameras,
        folderPath,
        isImporting: false,
        importError: null,
        selectedIds: firstId ? new Set([firstId]) : new Set(),
        expandedBursts: new Set(),
      });

      // Phase 2: Extract thumbnails in background
      get().extractThumbnails();
    } catch (err: any) {
      console.error('Import error:', err);
      const errorMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Unknown import error');
      set({
        isImporting: false,
        importError: errorMsg,
      });
    }
  },

  // Import a specific folder path (for dev/testing — bypasses dialog)
  importPath: async (folderPath: string) => {
    set({ isImporting: true, importError: null });

    try {
      if (!invoke) await loadTauriApis();
      if (!invoke) throw new Error('Tauri APIs not available');

      console.log('Importing path:', folderPath);
      const response = await invoke('import_folder', {
        request: { folderPath },
      }) as ImportResult;
      console.log('Import response:', response);

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Import failed');
      }

      const data = response.result;
      const allImages: ImageEntry[] = [];
      const burstGroups: BurstGroupData[] = [];

      for (const burst of data.bursts) {
        const { group, entries } = burstPayloadToGroup(burst);
        burstGroups.push(group);
        allImages.push(...entries);
      }

      for (const single of data.singles) {
        allImages.push(payloadToEntry(single, null, null));
      }

      allImages.sort((a, b) => a.timestamp - b.timestamp);

      const cameras: CameraGroup[] = data.cameras.map((c) => ({
        serial: c.serial,
        make: c.make,
        model: c.model,
        imageCount: c.image_count,
        burstCount: c.burst_count,
      }));

      const firstId = allImages.length > 0 ? allImages[0].id : null;

      set({
        images: allImages,
        burstGroups,
        cameras,
        folderPath,
        isImporting: false,
        importError: null,
        selectedIds: firstId ? new Set([firstId]) : new Set(),
        expandedBursts: new Set(),
      });

      // Phase 2: Extract thumbnails in background
      get().extractThumbnails();
    } catch (err: any) {
      console.error('Import error:', err);
      const errorMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Unknown error');
      set({ isImporting: false, importError: errorMsg });
    }
  },

  openLoupe: (imageId: string) => {
    const { images, burstGroups } = get();
    const image = images.find((img) => img.id === imageId);
    if (!image) return;

    // Determine if this image is in a burst
    const burstId = image.burstGroupId || null;

    // Smart start frame: open loupe on the most useful image in the burst.
    // First pick (resume where you left off) > first unflagged (next to review) > first frame.
    let startId = imageId;
    if (burstId) {
      const burst = burstGroups.find((b) => b.id === burstId);
      if (burst) {
        const firstPick = burst.images.find((img) => img.flag === 'pick');
        if (firstPick) {
          startId = firstPick.id;
        } else {
          const firstUnflagged = burst.images.find((img) => img.flag === 'none');
          if (firstUnflagged) startId = firstUnflagged.id;
        }
      }
    }

    set({
      loupe: { active: true, imageId: startId, burstId, loupeUrls: get().loupe.loupeUrls },
      selectedIds: new Set([startId]),
    });

    // Pre-fetch full-res images for the burst (or just this image)
    (async () => {
      if (!invoke) await loadTauriApis();
      if (!invoke || !convertFileSrc) return;

      try {
        let pathsToFetch: string[];
        if (burstId) {
          const burst = burstGroups.find((b) => b.id === burstId);
          pathsToFetch = burst ? burst.images.map((img) => img.path) : [image.path];
        } else {
          pathsToFetch = [image.path];
        }

        const loupeMap = await invoke('extract_burst_loupe_images', {
          filePaths: pathsToFetch,
        }) as Record<string, string>;

        // Convert file paths to asset URLs
        const loupeUrls: Record<string, string> = {};
        for (const [filePath, cachePath] of Object.entries(loupeMap)) {
          loupeUrls[filePath] = convertFileSrc!(cachePath);
        }

        set((state) => ({
          loupe: { ...state.loupe, loupeUrls: { ...state.loupe.loupeUrls, ...loupeUrls } },
        }));
      } catch (err) {
        console.error('Failed to extract loupe images:', err);
      }
    })();
  },

  closeLoupe: () => {
    const { loupe, burstGroups } = get();
    if (!loupe.active) return;

    // Keep selection on the burst/image we were viewing
    let selectionId: string | null = null;
    if (loupe.burstId) {
      // Select the first image of the burst (the stack cover)
      const burst = burstGroups.find((b) => b.id === loupe.burstId);
      if (burst && burst.images.length > 0) {
        selectionId = burst.images[0].id;
      }
    } else {
      selectionId = loupe.imageId;
    }

    set({
      loupe: { ...get().loupe, active: false, imageId: null, burstId: null },
      selectedIds: selectionId ? new Set([selectionId]) : new Set(),
    });
  },

  loupeNext: () => {
    const { loupe, images, burstGroups } = get();
    if (!loupe.active || !loupe.imageId) return;

    let navigableImages: ImageEntry[];
    if (loupe.burstId) {
      const burst = burstGroups.find((b) => b.id === loupe.burstId);
      navigableImages = burst ? burst.images : [];
    } else {
      navigableImages = images;
    }

    const currentIdx = navigableImages.findIndex((img) => img.id === loupe.imageId);
    if (currentIdx < navigableImages.length - 1) {
      const nextImage = navigableImages[currentIdx + 1];
      set({
        loupe: { ...loupe, imageId: nextImage.id },
        selectedIds: new Set([nextImage.id]),
      });
    }
  },

  loupePrev: () => {
    const { loupe, images, burstGroups } = get();
    if (!loupe.active || !loupe.imageId) return;

    let navigableImages: ImageEntry[];
    if (loupe.burstId) {
      const burst = burstGroups.find((b) => b.id === loupe.burstId);
      navigableImages = burst ? burst.images : [];
    } else {
      navigableImages = images;
    }

    const currentIdx = navigableImages.findIndex((img) => img.id === loupe.imageId);
    if (currentIdx > 0) {
      const prevImage = navigableImages[currentIdx - 1];
      set({
        loupe: { ...loupe, imageId: prevImage.id },
        selectedIds: new Set([prevImage.id]),
      });
    }
  },

  extractThumbnails: async () => {
    try {
      if (!invoke) await loadTauriApis();
      if (!invoke || !convertFileSrc) return;

      console.time('thumbnail extraction');
      const thumbMap = await invoke('extract_thumbnails', {}) as Record<string, string>;
      console.timeEnd('thumbnail extraction');
      console.log(`Extracted ${Object.keys(thumbMap).length} thumbnails`);

      // Update images with thumbnail URLs
      set((state) => ({
        images: state.images.map((img) => {
          const thumbPath = thumbMap[img.path];
          if (thumbPath && convertFileSrc) {
            return {
              ...img,
              thumbnailPath: thumbPath,
              thumbnailUrl: convertFileSrc(thumbPath),
            };
          }
          return img;
        }),
        burstGroups: state.burstGroups.map((burst) => ({
          ...burst,
          images: burst.images.map((img) => {
            const thumbPath = thumbMap[img.path];
            if (thumbPath && convertFileSrc) {
              return {
                ...img,
                thumbnailPath: thumbPath,
                thumbnailUrl: convertFileSrc(thumbPath),
              };
            }
            return img;
          }),
        })),
      }));
    } catch (err) {
      console.error('Thumbnail extraction failed:', err);
      // Non-fatal — grid still works with placeholders
    }
  },

  cycleOverlayMode: () => {
    set((state) => {
      const idx = overlayModes.indexOf(state.overlayMode);
      return { overlayMode: overlayModes[(idx + 1) % overlayModes.length] };
    });
  },
}));
