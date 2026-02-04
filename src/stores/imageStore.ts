/**
 * Central state store for ProjectLoupe.
 *
 * Architecture: Zustand store with normalized data model.
 * - Single source of truth: `imageMap` (Map<string, ImageEntry>)
 * - Burst groups reference images by ID: `normalizedBurstGroups[].imageIds`
 * - Reverse lookup: `burstIndex` (imageId → burstGroupId)
 * - Display order: `imageOrder` (string[] sorted by timestamp)
 * - All mutations go through imageMap — no dual-sync needed
 *
 * Import pipeline: folder dialog → Rust exiftool extraction → burst detection → store hydration
 * Thumbnails: two-tier cache (PreviewImage 640px for grid, JpgFromRaw 8K for loupe)
 */
import { create } from 'zustand';
import {
  ImageEntry,
  NormalizedBurstGroup,
  CameraGroup,
  FilterState,
  OverlayMode,
  ImportResult,
  ImagePayload,
  LoupeState,
} from '../types';

// Tauri APIs are loaded dynamically — they throw when running in a regular
// browser (e.g., Vite dev server without Tauri).
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let openDialog: ((options: Record<string, unknown>) => Promise<string | null>) | null = null;
let convertFileSrc: ((path: string) => string) | null = null;

// Debounce timer for preview loading on selection change
let previewDebounceTimer: number | null = null;

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
  // === Normalized data ===
  imageMap: Map<string, ImageEntry>;
  imageOrder: string[];                    // display order (sorted by timestamp)
  normalizedBurstGroups: NormalizedBurstGroup[];
  burstIndex: Map<string, string>;         // imageId → burstGroupId
  cameras: CameraGroup[];

  // === UI state ===
  selectedIds: Set<string>;
  filters: FilterState;
  overlayMode: OverlayMode;
  isImporting: boolean;
  importError: string | null;
  folderPath: string | null;
  loupe: LoupeState;

  // === Actions — image metadata ===
  setRating: (imageId: string, rating: number) => void;
  setFlag: (imageId: string, flag: 'none' | 'pick' | 'reject') => void;
  setColorLabel: (imageId: string, label: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple') => void;

  // === Actions — selection ===
  toggleSelection: (imageId: string) => void;
  selectRange: (startId: string, endId: string) => void;
  clearSelection: () => void;

  // === Actions — filters ===
  setFilter: (filterKey: keyof FilterState, value: any) => void;
  clearFilters: () => void;

  // === Actions — import ===
  importFolder: () => Promise<void>;
  importPath: (folderPath: string) => Promise<void>;
  importFromJson: (url: string) => Promise<void>;
  loadSession: (folderPath: string) => Promise<boolean>;
  applyAnnotations: () => Promise<void>;
  
  // === Actions — progressive thumbnails ===
  loadColorSwatches: () => Promise<void>;      // Phase 1: instant color backgrounds
  loadMicroThumbnails: () => Promise<void>;    // Phase 2: 300px grid thumbnails  
  loadPreviewForSelected: () => Promise<void>; // Phase 3: 1600px for selected image
  extractThumbnails: () => Promise<void>;      // Legacy v1 action (now calls loadMicroThumbnails)

  // === Actions — loupe ===
  openLoupe: (imageId: string) => void;
  closeLoupe: () => void;
  loupeNext: () => void;
  loupePrev: () => void;

  // === Actions — display ===
  cycleOverlayMode: () => void;
}

const overlayModes: OverlayMode[] = ['none', 'minimal', 'standard', 'full'];

// Convert backend payload to frontend ImageEntry
function payloadToEntry(img: ImagePayload, burstId: string | null, burstIndex: number | null): ImageEntry {
  const ts = new Date(img.capture_time).getTime();
  let hash = 0;
  for (let i = 0; i < img.filename.length; i++) {
    hash = ((hash << 5) - hash + img.filename.charCodeAt(i)) | 0;
  }

  return {
    id: img.file_path,
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

/**
 * Hydrate the normalized store from an ImportResult payload.
 * Used by importFolder, importPath, and importFromJson.
 */
function hydrateFromPayload(data: NonNullable<ImportResult['result']>) {
  const imageMap = new Map<string, ImageEntry>();
  const burstIdx = new Map<string, string>();
  const normalizedBursts: NormalizedBurstGroup[] = [];

  for (const burst of data.bursts) {
    const imageIds: string[] = [];
    for (let i = 0; i < burst.images.length; i++) {
      const entry = payloadToEntry(burst.images[i], burst.id, i);
      imageMap.set(entry.id, entry);
      imageIds.push(entry.id);
      burstIdx.set(entry.id, burst.id);
    }
    normalizedBursts.push({
      id: burst.id,
      cameraSerial: burst.camera_serial,
      imageIds,
      frameCount: burst.frame_count,
      durationMs: burst.duration_ms,
      avgGapMs: burst.avg_gap_ms,
      estimatedFps: burst.estimated_fps,
    });
  }

  for (const single of data.singles) {
    const entry = payloadToEntry(single, null, null);
    imageMap.set(entry.id, entry);
  }

  // Sort by timestamp for display order
  const imageOrder = Array.from(imageMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((img) => img.id);

  const cameras: CameraGroup[] = data.cameras.map((c) => ({
    serial: c.serial,
    make: c.make,
    model: c.model,
    imageCount: c.image_count,
    burstCount: c.burst_count,
  }));

  const firstId = imageOrder.length > 0 ? imageOrder[0] : null;

  return {
    imageMap,
    imageOrder,
    normalizedBurstGroups: normalizedBursts,
    burstIndex: burstIdx,
    cameras,
    selectedIds: firstId ? new Set([firstId]) : new Set<string>(),
  };
}

/**
 * Update a single image in the map. Returns a new Map (immutable for Zustand).
 */
function updateInMap(
  map: Map<string, ImageEntry>,
  imageId: string,
  patch: Partial<ImageEntry>,
): Map<string, ImageEntry> {
  const img = map.get(imageId);
  if (!img) return map;
  const newMap = new Map(map);
  newMap.set(imageId, { ...img, ...patch });
  return newMap;
}

/**
 * Get navigable image IDs for loupe, respecting burst scope and active filters.
 * - If burst-scoped: navigate within burst frames
 * - Otherwise: navigate through filtered image list
 */
function getLoupeNavigableIds(
  loupe: LoupeState,
  imageMap: Map<string, ImageEntry>,
  imageOrder: string[],
  normalizedBurstGroups: NormalizedBurstGroup[],
  filters: FilterState,
): string[] {
  if (loupe.burstId) {
    const burst = normalizedBurstGroups.find((b) => b.id === loupe.burstId);
    return burst ? burst.imageIds : [];
  }

  return imageOrder.filter((id) => {
    const img = imageMap.get(id);
    if (!img) return false;
    if (img.rating < filters.minRating) return false;
    if (filters.flags.size > 0 && !filters.flags.has(img.flag)) return false;
    if (filters.colorLabels.size > 0 && !filters.colorLabels.has(img.colorLabel)) return false;
    if (filters.showBurstsOnly && !img.burstGroupId) return false;
    if (filters.cameraSerial && img.serialNumber !== filters.cameraSerial) return false;
    return true;
  });
}

export const useImageStore = create<ImageStore>((set, get) => ({
  // Normalized data
  imageMap: new Map(),
  imageOrder: [],
  normalizedBurstGroups: [],
  burstIndex: new Map(),
  cameras: [],

  // UI state
  selectedIds: new Set(),
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
    set((state) => ({ imageMap: updateInMap(state.imageMap, imageId, { rating }) }));
    // Write-through to SQLite (fire-and-forget)
    invoke?.('persist_rating', { filePath: imageId, rating }).catch(() => {});
  },

  setFlag: (imageId, flag) => {
    const current = get().imageMap.get(imageId);
    const newFlag = current && current.flag === flag ? 'none' : flag;
    set((state) => ({ imageMap: updateInMap(state.imageMap, imageId, { flag: newFlag }) }));
    // Write-through to SQLite
    invoke?.('persist_flag', { filePath: imageId, flag: newFlag }).catch(() => {});
  },

  setColorLabel: (imageId, label) => {
    const current = get().imageMap.get(imageId);
    const newLabel = current && current.colorLabel === label ? 'none' : label;
    set((state) => ({ imageMap: updateInMap(state.imageMap, imageId, { colorLabel: newLabel }) }));
    // Write-through to SQLite
    invoke?.('persist_color_label', { filePath: imageId, colorLabel: newLabel }).catch(() => {});
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

    // Debounced preview loading for selected images
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      get().loadPreviewForSelected();
    }, 200);
  },

  selectRange: (startId, endId) => {
    const { imageOrder, selectedIds } = get();
    const startIndex = imageOrder.indexOf(startId);
    const endIndex = imageOrder.indexOf(endId);
    if (startIndex === -1 || endIndex === -1) return;
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    const newSelectedIds = new Set(selectedIds);
    for (let i = min; i <= max; i++) newSelectedIds.add(imageOrder[i]);
    set({ selectedIds: newSelectedIds });

    // Debounced preview loading for selected images
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      get().loadPreviewForSelected();
    }, 200);
  },

  clearSelection: () => set({ selectedIds: new Set() }),

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
      if (!openDialog || !invoke) await loadTauriApis();
      if (!openDialog || !invoke) throw new Error('Tauri APIs not available — must run inside Tauri.');

      const selectedPath = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select photo folder',
      });

      if (!selectedPath) {
        set({ isImporting: false });
        return;
      }

      const folderPath = typeof selectedPath === 'string' ? selectedPath : (selectedPath as string[])[0];

      // Try loading existing session first
      const restored = await get().loadSession(folderPath);
      if (restored) return;

      const response = await invoke('import_folder', {
        request: { folderPath },
      }) as ImportResult;

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Import failed');
      }

      const hydrated = hydrateFromPayload(response.result);
      set({
        ...hydrated,
        folderPath,
        isImporting: false,
        importError: null,
      });

      // Progressive thumbnail loading pipeline
      const store = get();
      await store.loadColorSwatches();   // Phase 1: instant color backgrounds
      await store.loadMicroThumbnails(); // Phase 2: 300px grid thumbnails
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Unknown import error');
      set({ isImporting: false, importError: errorMsg });
    }
  },

  importPath: async (folderPath: string) => {
    set({ isImporting: true, importError: null });
    try {
      if (!invoke) await loadTauriApis();
      if (!invoke) throw new Error('Tauri APIs not available');

      // Try loading existing session first
      const restored = await get().loadSession(folderPath);
      if (restored) return;

      const response = await invoke('import_folder', {
        request: { folderPath },
      }) as ImportResult;

      if (!response.success || !response.result) {
        throw new Error(response.error || 'Import failed');
      }

      const hydrated = hydrateFromPayload(response.result);
      set({
        ...hydrated,
        folderPath,
        isImporting: false,
        importError: null,
      });

      // Progressive thumbnail loading pipeline
      const store = get();
      await store.loadColorSwatches();   // Phase 1: instant color backgrounds
      await store.loadMicroThumbnails(); // Phase 2: 300px grid thumbnails
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Unknown error');
      set({ isImporting: false, importError: errorMsg });
    }
  },

  importFromJson: async (url: string) => {
    set({ isImporting: true, importError: null });
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
      const payload = await resp.json() as ImportResult;

      if (!payload.success || !payload.result) {
        throw new Error(payload.error || 'Invalid payload');
      }

      const hydrated = hydrateFromPayload(payload.result);
      set({
        ...hydrated,
        folderPath: '(browser-mode import)',
        isImporting: false,
        importError: null,
      });

      console.log(`Imported ${hydrated.imageMap.size} images, ${hydrated.normalizedBurstGroups.length} bursts from JSON`);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Unknown error');
      set({ isImporting: false, importError: errorMsg });
    }
  },

  // Try to load an existing session from SQLite. Returns true if session existed.
  loadSession: async (folderPath: string) => {
    if (!invoke) await loadTauriApis();
    if (!invoke) return false;

    try {
      const response = await invoke('load_session', { folderPath }) as ImportResult;
      if (!response.success || !response.result) return false;

      const hydrated = hydrateFromPayload(response.result);
      set({
        ...hydrated,
        folderPath,
        isImporting: false,
        importError: null,
      });

      // Apply persisted annotations (flags, ratings, labels)
      await get().applyAnnotations();
      
      // Progressive thumbnail loading pipeline
      const store = get();
      await store.loadColorSwatches();   // Phase 1: instant color backgrounds
      await store.loadMicroThumbnails(); // Phase 2: 300px grid thumbnails

      console.log(`Restored session: ${hydrated.imageMap.size} images from SQLite`);
      return true;
    } catch {
      return false;
    }
  },

  // Load and apply persisted annotations from SQLite onto the in-memory store.
  applyAnnotations: async () => {
    if (!invoke) return;

    try {
      const annotations = await invoke('load_annotations', {}) as Record<
        string,
        { flag: string; rating: number; color_label: string }
      >;

      if (!annotations || Object.keys(annotations).length === 0) return;

      set((state) => {
        const newMap = new Map(state.imageMap);
        for (const [filePath, ann] of Object.entries(annotations)) {
          const img = newMap.get(filePath);
          if (img) {
            newMap.set(filePath, {
              ...img,
              flag: ann.flag as ImageEntry['flag'],
              rating: ann.rating,
              colorLabel: ann.color_label as ImageEntry['colorLabel'],
            });
          }
        }
        return { imageMap: newMap };
      });

      console.log(`Applied ${Object.keys(annotations).length} persisted annotations`);
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  },

  openLoupe: (imageId: string) => {
    const { imageMap, imageOrder, normalizedBurstGroups, burstIndex, filters } = get();
    const image = imageMap.get(imageId);
    if (!image) return;

    // Detect review mode: any content filter active → no burst scoping
    const isReviewMode = filters.minRating > 0 || filters.flags.size > 0 || filters.colorLabels.size > 0;

    const burstId = (!isReviewMode && burstIndex.get(imageId)) || null;

    // Smart start frame: first pick > first unflagged > first frame
    let startId = imageId;
    if (burstId) {
      const burst = normalizedBurstGroups.find((b) => b.id === burstId);
      if (burst) {
        const burstImages = burst.imageIds.map((id) => imageMap.get(id)!);
        const firstPick = burstImages.find((img) => img.flag === 'pick');
        if (firstPick) {
          startId = firstPick.id;
        } else {
          const firstUnflagged = burstImages.find((img) => img.flag === 'none');
          if (firstUnflagged) startId = firstUnflagged.id;
        }
      }
    }

    set({
      loupe: { active: true, imageId: startId, burstId, loupeUrls: get().loupe.loupeUrls },
      selectedIds: new Set([startId]),
    });

    // Pre-fetch full-res images for the navigable set
    (async () => {
      if (!invoke) await loadTauriApis();
      if (!invoke || !convertFileSrc) return;

      try {
        // Build the full list of paths we'll navigate through
        const navigableIds = getLoupeNavigableIds(
          { active: true, imageId: startId, burstId, loupeUrls: {} },
          imageMap, imageOrder, normalizedBurstGroups, filters,
        );
        const pathsToFetch = navigableIds
          .map((id) => imageMap.get(id)?.path)
          .filter(Boolean) as string[];

        if (pathsToFetch.length === 0) return;

        // Fetch current image first for instant display, then the rest
        const currentPath = imageMap.get(startId)?.path;
        if (currentPath) {
          const firstMap = await invoke('extract_burst_loupe_images', {
            filePaths: [currentPath],
          }) as Record<string, string>;

          const firstUrls: Record<string, string> = {};
          for (const [filePath, cachePath] of Object.entries(firstMap)) {
            firstUrls[filePath] = convertFileSrc!(cachePath);
          }
          set((state) => ({
            loupe: { ...state.loupe, loupeUrls: { ...state.loupe.loupeUrls, ...firstUrls } },
          }));
        }

        // Then prefetch the rest in background
        const remainingPaths = pathsToFetch.filter((p) => p !== currentPath);
        if (remainingPaths.length > 0) {
          const loupeMap = await invoke('extract_burst_loupe_images', {
            filePaths: remainingPaths,
          }) as Record<string, string>;

          const loupeUrls: Record<string, string> = {};
          for (const [filePath, cachePath] of Object.entries(loupeMap)) {
            loupeUrls[filePath] = convertFileSrc!(cachePath);
          }
          set((state) => ({
            loupe: { ...state.loupe, loupeUrls: { ...state.loupe.loupeUrls, ...loupeUrls } },
          }));
        }
      } catch (err) {
        console.error('Failed to extract loupe images:', err);
      }
    })();
  },

  closeLoupe: () => {
    const { loupe, normalizedBurstGroups } = get();
    if (!loupe.active) return;

    let selectionId: string | null = null;
    if (loupe.burstId) {
      const burst = normalizedBurstGroups.find((b) => b.id === loupe.burstId);
      if (burst && burst.imageIds.length > 0) {
        selectionId = burst.imageIds[0];
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
    const { loupe, imageMap, imageOrder, normalizedBurstGroups, filters } = get();
    if (!loupe.active || !loupe.imageId) return;

    const navigableIds = getLoupeNavigableIds(loupe, imageMap, imageOrder, normalizedBurstGroups, filters);
    const currentIdx = navigableIds.indexOf(loupe.imageId);
    if (currentIdx < navigableIds.length - 1) {
      const nextId = navigableIds[currentIdx + 1];
      set({
        loupe: { ...loupe, imageId: nextId },
        selectedIds: new Set([nextId]),
      });
    }
  },

  loupePrev: () => {
    const { loupe, imageMap, imageOrder, normalizedBurstGroups, filters } = get();
    if (!loupe.active || !loupe.imageId) return;

    const navigableIds = getLoupeNavigableIds(loupe, imageMap, imageOrder, normalizedBurstGroups, filters);
    const currentIdx = navigableIds.indexOf(loupe.imageId);
    if (currentIdx > 0) {
      const prevId = navigableIds[currentIdx - 1];
      set({
        loupe: { ...loupe, imageId: prevId },
        selectedIds: new Set([prevId]),
      });
    }
  },

  // Progressive thumbnail loading actions
  loadColorSwatches: async () => {
    try {
      if (!invoke) await loadTauriApis();
      if (!invoke) return; // Gracefully degrade in browser mode

      const { imageMap } = get();
      const filePaths = Array.from(imageMap.keys());
      if (filePaths.length === 0) return;

      console.time('color swatch loading');
      const swatchMap = await invoke('get_color_swatches', { filePaths }) as Record<string, string>;
      console.timeEnd('color swatch loading');
      console.log(`Loaded ${Object.keys(swatchMap).length} color swatches`);

      set((state) => {
        const newMap = new Map(state.imageMap);
        for (const [filePath, colorHex] of Object.entries(swatchMap)) {
          const img = newMap.get(filePath);
          if (img) {
            newMap.set(filePath, {
              ...img,
              colorSwatch: colorHex,
              thumbnailTier: 'swatch',
            });
          }
        }
        return { imageMap: newMap };
      });
    } catch (err) {
      console.error('Color swatch loading failed:', err);
    }
  },

  loadMicroThumbnails: async () => {
    try {
      if (!invoke) await loadTauriApis();
      if (!invoke || !convertFileSrc) return; // Gracefully degrade in browser mode

      const { imageMap } = get();
      const filePaths = Array.from(imageMap.keys());
      if (filePaths.length === 0) return;

      console.time('micro thumbnail loading');
      const thumbMap = await invoke('get_thumbnails_batch_v2', { 
        filePaths, 
        tier: 'micro' 
      }) as Record<string, string>;
      console.timeEnd('micro thumbnail loading');
      console.log(`Loaded ${Object.keys(thumbMap).length} micro thumbnails`);

      set((state) => {
        const newMap = new Map(state.imageMap);
        for (const [filePath, cachePath] of Object.entries(thumbMap)) {
          const img = newMap.get(filePath);
          if (img && convertFileSrc) {
            const assetUrl = convertFileSrc(cachePath);
            newMap.set(filePath, {
              ...img,
              microThumbnailUrl: assetUrl,
              thumbnailUrl: assetUrl, // Backward compatibility
              thumbnailPath: cachePath, // Backward compatibility
              thumbnailTier: 'micro',
            });
          }
        }
        return { imageMap: newMap };
      });
    } catch (err) {
      console.error('Micro thumbnail loading failed:', err);
    }
  },

  loadPreviewForSelected: async () => {
    try {
      if (!invoke) await loadTauriApis();
      if (!invoke || !convertFileSrc) return; // Gracefully degrade in browser mode

      const { selectedIds, imageMap } = get();
      const selectedPaths = Array.from(selectedIds)
        .map(id => imageMap.get(id)?.path)
        .filter(Boolean) as string[];
      
      if (selectedPaths.length === 0) return;

      console.time('preview thumbnail loading');
      const previewMap = await invoke('get_thumbnails_batch_v2', {
        filePaths: selectedPaths,
        tier: 'preview'
      }) as Record<string, string>;
      console.timeEnd('preview thumbnail loading');
      console.log(`Loaded ${Object.keys(previewMap).length} preview thumbnails`);

      set((state) => {
        const newMap = new Map(state.imageMap);
        for (const [filePath, cachePath] of Object.entries(previewMap)) {
          const img = newMap.get(filePath);
          if (img && convertFileSrc) {
            newMap.set(filePath, {
              ...img,
              previewThumbnailUrl: convertFileSrc(cachePath),
              thumbnailTier: 'preview',
            });
          }
        }
        return { imageMap: newMap };
      });
    } catch (err) {
      console.error('Preview thumbnail loading failed:', err);
    }
  },

  extractThumbnails: async () => {
    // Legacy v1 action - now calls loadMicroThumbnails for backward compatibility
    await get().loadMicroThumbnails();
  },

  cycleOverlayMode: () => {
    set((state) => {
      const idx = overlayModes.indexOf(state.overlayMode);
      return { overlayMode: overlayModes[(idx + 1) % overlayModes.length] };
    });
  },
}));
