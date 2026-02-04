/**
 * Unit tests for the normalized image store.
 *
 * Tests the store in isolation — no Tauri, no browser, no React.
 * Uses Zustand's getState()/setState() directly.
 *
 * Coverage targets:
 * - All mutation actions (flag, rating, color label)
 * - Selection (toggle, range, clear)
 * - Filter logic
 * - Loupe (open, close, next, prev, smart start)
 * - Overlay cycling
 * - Import hydration (importFromJson)
 * - Edge cases (empty store, invalid IDs, boundary navigation)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useImageStore } from '../imageStore';
import { ImageEntry, NormalizedBurstGroup } from '../../types';

// -- Test fixtures --

function makeImage(overrides: Partial<ImageEntry> = {}): ImageEntry {
  const id = overrides.id || `img-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    filename: overrides.filename || `${id}.NEF`,
    path: overrides.path || `/photos/${id}.NEF`,
    timestamp: overrides.timestamp || Date.now(),
    captureTime: overrides.captureTime || new Date().toISOString(),
    serialNumber: overrides.serialNumber || '3002851',
    driveMode: overrides.driveMode || 'ContinuousHigh',
    exif: overrides.exif || {
      iso: 800,
      aperture: 4.5,
      shutterSpeed: '1/3200',
      focalLength: 500,
      camera: 'NIKON Z 9',
      lens: 'VR 500mm f/4E',
    },
    rating: overrides.rating ?? 0,
    flag: overrides.flag || 'none',
    colorLabel: overrides.colorLabel || 'none',
    burstGroupId: overrides.burstGroupId ?? null,
    burstIndex: overrides.burstIndex ?? null,
    _placeholderHue: 180,
    _placeholderBrightness: 0.5,
  };
}

/** Seed the store with images and optional burst groups. */
function seedStore(opts: {
  images?: ImageEntry[];
  bursts?: NormalizedBurstGroup[];
} = {}) {
  const images = opts.images || [
    makeImage({ id: 'img-1', timestamp: 1000 }),
    makeImage({ id: 'img-2', timestamp: 2000 }),
    makeImage({ id: 'img-3', timestamp: 3000 }),
  ];

  const imageMap = new Map(images.map((img) => [img.id, img]));
  const imageOrder = images
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((img) => img.id);

  const burstIndex = new Map<string, string>();
  for (const burst of opts.bursts || []) {
    for (const id of burst.imageIds) {
      burstIndex.set(id, burst.id);
    }
  }

  useImageStore.setState({
    imageMap,
    imageOrder,
    normalizedBurstGroups: opts.bursts || [],
    burstIndex,
    cameras: [],
    selectedIds: new Set(),
    filters: {
      minRating: 0,
      flags: new Set(),
      colorLabels: new Set(),
      showBurstsOnly: false,
      cameraSerial: null,
    },
    overlayMode: 'minimal',
    isImporting: false,
    importError: null,
    folderPath: null,
    loupe: { active: false, imageId: null, burstId: null, loupeUrls: {} },
  });
}

function getStore() {
  return useImageStore.getState();
}

// -- Reset store before each test --
beforeEach(() => {
  useImageStore.setState({
    imageMap: new Map(),
    imageOrder: [],
    normalizedBurstGroups: [],
    burstIndex: new Map(),
    cameras: [],
    selectedIds: new Set(),
    filters: {
      minRating: 0,
      flags: new Set(),
      colorLabels: new Set(),
      showBurstsOnly: false,
      cameraSerial: null,
    },
    overlayMode: 'minimal',
    isImporting: false,
    importError: null,
    folderPath: null,
    loupe: { active: false, imageId: null, burstId: null, loupeUrls: {} },
  });
});

// ============================================================
// FLAGS
// ============================================================

describe('setFlag', () => {
  it('flags an image as pick', () => {
    seedStore();
    getStore().setFlag('img-1', 'pick');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('pick');
  });

  it('flags an image as reject', () => {
    seedStore();
    getStore().setFlag('img-1', 'reject');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('reject');
  });

  it('toggles pick → none when already picked', () => {
    seedStore({ images: [makeImage({ id: 'img-1', flag: 'pick' })] });
    getStore().setFlag('img-1', 'pick');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('none');
  });

  it('toggles reject → none when already rejected', () => {
    seedStore({ images: [makeImage({ id: 'img-1', flag: 'reject' })] });
    getStore().setFlag('img-1', 'reject');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('none');
  });

  it('switches pick → reject (not toggle)', () => {
    seedStore({ images: [makeImage({ id: 'img-1', flag: 'pick' })] });
    getStore().setFlag('img-1', 'reject');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('reject');
  });

  it('does not affect other images', () => {
    seedStore();
    getStore().setFlag('img-1', 'pick');
    expect(getStore().imageMap.get('img-2')?.flag).toBe('none');
    expect(getStore().imageMap.get('img-3')?.flag).toBe('none');
  });

  it('no-ops on nonexistent image ID', () => {
    seedStore();
    const before = new Map(getStore().imageMap);
    getStore().setFlag('nonexistent', 'pick');
    expect(getStore().imageMap).toEqual(before);
  });

  it('unflag with "none" always sets to none', () => {
    seedStore({ images: [makeImage({ id: 'img-1', flag: 'pick' })] });
    // setFlag('none') hits the toggle path: current='pick', flag='none' → not equal → set 'none'
    getStore().setFlag('img-1', 'none');
    expect(getStore().imageMap.get('img-1')?.flag).toBe('none');
  });
});

// ============================================================
// RATINGS
// ============================================================

describe('setRating', () => {
  it('sets rating 1-5', () => {
    seedStore();
    for (let r = 1; r <= 5; r++) {
      getStore().setRating('img-1', r);
      expect(getStore().imageMap.get('img-1')?.rating).toBe(r);
    }
  });

  it('clears rating with 0', () => {
    seedStore({ images: [makeImage({ id: 'img-1', rating: 3 })] });
    getStore().setRating('img-1', 0);
    expect(getStore().imageMap.get('img-1')?.rating).toBe(0);
  });

  it('does not affect other images', () => {
    seedStore();
    getStore().setRating('img-1', 5);
    expect(getStore().imageMap.get('img-2')?.rating).toBe(0);
  });
});

// ============================================================
// COLOR LABELS
// ============================================================

describe('setColorLabel', () => {
  it('sets each color label', () => {
    seedStore();
    const labels = ['red', 'yellow', 'green', 'blue', 'purple'] as const;
    for (const label of labels) {
      getStore().setColorLabel('img-1', label);
      expect(getStore().imageMap.get('img-1')?.colorLabel).toBe(label);
    }
  });

  it('clears with "none"', () => {
    seedStore({ images: [makeImage({ id: 'img-1', colorLabel: 'red' })] });
    getStore().setColorLabel('img-1', 'none');
    expect(getStore().imageMap.get('img-1')?.colorLabel).toBe('none');
  });

  it('toggles same label off (red → none)', () => {
    seedStore({ images: [makeImage({ id: 'img-1', colorLabel: 'red' })] });
    getStore().setColorLabel('img-1', 'red');
    expect(getStore().imageMap.get('img-1')?.colorLabel).toBe('none');
  });

  it('switches labels (red → blue, not toggle off)', () => {
    seedStore({ images: [makeImage({ id: 'img-1', colorLabel: 'red' })] });
    getStore().setColorLabel('img-1', 'blue');
    expect(getStore().imageMap.get('img-1')?.colorLabel).toBe('blue');
  });
});

// ============================================================
// SELECTION
// ============================================================

describe('selection', () => {
  it('toggleSelection adds an image', () => {
    seedStore();
    getStore().toggleSelection('img-1');
    expect(getStore().selectedIds.has('img-1')).toBe(true);
  });

  it('toggleSelection removes a selected image', () => {
    seedStore();
    getStore().toggleSelection('img-1');
    getStore().toggleSelection('img-1');
    expect(getStore().selectedIds.has('img-1')).toBe(false);
  });

  it('supports multi-select via multiple toggles', () => {
    seedStore();
    getStore().toggleSelection('img-1');
    getStore().toggleSelection('img-2');
    expect(getStore().selectedIds.size).toBe(2);
    expect(getStore().selectedIds.has('img-1')).toBe(true);
    expect(getStore().selectedIds.has('img-2')).toBe(true);
  });

  it('clearSelection clears all', () => {
    seedStore();
    getStore().toggleSelection('img-1');
    getStore().toggleSelection('img-2');
    getStore().clearSelection();
    expect(getStore().selectedIds.size).toBe(0);
  });

  it('selectRange selects a contiguous range', () => {
    seedStore();
    getStore().selectRange('img-1', 'img-3');
    expect(getStore().selectedIds.size).toBe(3);
  });

  it('selectRange works in reverse order', () => {
    seedStore();
    getStore().selectRange('img-3', 'img-1');
    expect(getStore().selectedIds.size).toBe(3);
  });

  it('selectRange no-ops with invalid IDs', () => {
    seedStore();
    getStore().selectRange('nonexistent', 'img-1');
    expect(getStore().selectedIds.size).toBe(0);
  });
});

// ============================================================
// FILTERS
// ============================================================

describe('filters', () => {
  it('setFilter updates a single filter key', () => {
    seedStore();
    getStore().setFilter('minRating', 3);
    expect(getStore().filters.minRating).toBe(3);
  });

  it('setFilter updates flag set', () => {
    seedStore();
    getStore().setFilter('flags', new Set(['pick']));
    expect(getStore().filters.flags.has('pick')).toBe(true);
  });

  it('clearFilters resets all filters', () => {
    seedStore();
    getStore().setFilter('minRating', 3);
    getStore().setFilter('flags', new Set(['pick']));
    getStore().setFilter('showBurstsOnly', true);
    getStore().clearFilters();
    const f = getStore().filters;
    expect(f.minRating).toBe(0);
    expect(f.flags.size).toBe(0);
    expect(f.showBurstsOnly).toBe(false);
  });
});

// ============================================================
// OVERLAY
// ============================================================

describe('cycleOverlayMode', () => {
  it('cycles none → minimal → standard → full → none', () => {
    seedStore();
    useImageStore.setState({ overlayMode: 'none' });
    
    getStore().cycleOverlayMode();
    expect(getStore().overlayMode).toBe('minimal');
    
    getStore().cycleOverlayMode();
    expect(getStore().overlayMode).toBe('standard');
    
    getStore().cycleOverlayMode();
    expect(getStore().overlayMode).toBe('full');
    
    getStore().cycleOverlayMode();
    expect(getStore().overlayMode).toBe('none');
  });
});

// ============================================================
// LOUPE
// ============================================================

describe('loupe', () => {
  const burstImages = [
    makeImage({ id: 'b1', timestamp: 1000, burstGroupId: 'burst-1', burstIndex: 0 }),
    makeImage({ id: 'b2', timestamp: 1050, burstGroupId: 'burst-1', burstIndex: 1 }),
    makeImage({ id: 'b3', timestamp: 1100, burstGroupId: 'burst-1', burstIndex: 2 }),
    makeImage({ id: 'b4', timestamp: 1150, burstGroupId: 'burst-1', burstIndex: 3 }),
  ];

  const burst: NormalizedBurstGroup = {
    id: 'burst-1',
    cameraSerial: '3002851',
    imageIds: ['b1', 'b2', 'b3', 'b4'],
    frameCount: 4,
    durationMs: 150,
    avgGapMs: 50,
    estimatedFps: 20,
  };

  const single = makeImage({ id: 'single-1', timestamp: 5000 });

  function seedWithBurst() {
    seedStore({
      images: [...burstImages, single],
      bursts: [burst],
    });
  }

  describe('openLoupe', () => {
    it('opens loupe on a single image', () => {
      seedWithBurst();
      getStore().openLoupe('single-1');
      const l = getStore().loupe;
      expect(l.active).toBe(true);
      expect(l.imageId).toBe('single-1');
      expect(l.burstId).toBeNull();
    });

    it('opens loupe on a burst image and locks to burst', () => {
      seedWithBurst();
      getStore().openLoupe('b2');
      const l = getStore().loupe;
      expect(l.active).toBe(true);
      expect(l.burstId).toBe('burst-1');
    });

    it('smart start: opens on first unflagged when no picks', () => {
      seedWithBurst();
      // All unflagged — should start on first frame
      getStore().openLoupe('b3');
      expect(getStore().loupe.imageId).toBe('b1');
    });

    it('smart start: opens on first pick when picks exist', () => {
      seedWithBurst();
      getStore().setFlag('b3', 'pick');
      getStore().openLoupe('b1');
      expect(getStore().loupe.imageId).toBe('b3');
    });

    it('smart start: opens on first unflagged when some rejected', () => {
      seedWithBurst();
      getStore().setFlag('b1', 'reject');
      getStore().setFlag('b2', 'reject');
      getStore().openLoupe('b1');
      // b3 is first unflagged
      expect(getStore().loupe.imageId).toBe('b3');
    });

    it('sets selection to the start image', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      expect(getStore().selectedIds.has(getStore().loupe.imageId!)).toBe(true);
    });

    it('no-ops for nonexistent image', () => {
      seedWithBurst();
      getStore().openLoupe('nonexistent');
      expect(getStore().loupe.active).toBe(false);
    });
  });

  describe('closeLoupe', () => {
    it('closes and selects the burst first image', () => {
      seedWithBurst();
      getStore().openLoupe('b2');
      getStore().closeLoupe();
      expect(getStore().loupe.active).toBe(false);
      expect(getStore().selectedIds.has('b1')).toBe(true);
    });

    it('closes and selects the single image', () => {
      seedWithBurst();
      getStore().openLoupe('single-1');
      getStore().closeLoupe();
      expect(getStore().loupe.active).toBe(false);
      expect(getStore().selectedIds.has('single-1')).toBe(true);
    });

    it('no-ops when loupe is not active', () => {
      seedWithBurst();
      getStore().closeLoupe();
      expect(getStore().loupe.active).toBe(false);
    });
  });

  describe('loupeNext / loupePrev', () => {
    it('navigates forward within a burst', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      // Smart start puts us on b1 (all unflagged, first unflagged = b1)
      expect(getStore().loupe.imageId).toBe('b1');
      
      getStore().loupeNext();
      expect(getStore().loupe.imageId).toBe('b2');
      
      getStore().loupeNext();
      expect(getStore().loupe.imageId).toBe('b3');
      
      getStore().loupeNext();
      expect(getStore().loupe.imageId).toBe('b4');
    });

    it('stays on last frame when at end', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      useImageStore.setState((s) => ({ loupe: { ...s.loupe, imageId: 'b4' } }));
      
      getStore().loupeNext();
      expect(getStore().loupe.imageId).toBe('b4');
    });

    it('navigates backward within a burst', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      useImageStore.setState((s) => ({ loupe: { ...s.loupe, imageId: 'b3' } }));
      
      getStore().loupePrev();
      expect(getStore().loupe.imageId).toBe('b2');
    });

    it('stays on first frame when at start', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      
      getStore().loupePrev();
      expect(getStore().loupe.imageId).toBe('b1');
    });

    it('updates selection when navigating', () => {
      seedWithBurst();
      getStore().openLoupe('b1');
      getStore().loupeNext();
      expect(getStore().selectedIds.has('b2')).toBe(true);
      expect(getStore().selectedIds.size).toBe(1);
    });

    it('no-ops when loupe is not active', () => {
      seedWithBurst();
      getStore().loupeNext();
      expect(getStore().loupe.imageId).toBeNull();
    });
  });
});

// ============================================================
// BURST-SPECIFIC BEHAVIORS
// ============================================================

describe('burst behaviors', () => {
  const burstImages = [
    makeImage({ id: 'b1', timestamp: 1000, burstGroupId: 'burst-1', burstIndex: 0 }),
    makeImage({ id: 'b2', timestamp: 1050, burstGroupId: 'burst-1', burstIndex: 1 }),
    makeImage({ id: 'b3', timestamp: 1100, burstGroupId: 'burst-1', burstIndex: 2 }),
  ];

  const burst: NormalizedBurstGroup = {
    id: 'burst-1',
    cameraSerial: '3002851',
    imageIds: ['b1', 'b2', 'b3'],
    frameCount: 3,
    durationMs: 100,
    avgGapMs: 50,
    estimatedFps: 20,
  };

  it('burstIndex maps image IDs to burst ID', () => {
    seedStore({ images: burstImages, bursts: [burst] });
    const s = getStore();
    expect(s.burstIndex.get('b1')).toBe('burst-1');
    expect(s.burstIndex.get('b2')).toBe('burst-1');
    expect(s.burstIndex.get('b3')).toBe('burst-1');
  });

  it('flagging one burst image does not flag others', () => {
    seedStore({ images: burstImages, bursts: [burst] });
    getStore().setFlag('b1', 'pick');
    expect(getStore().imageMap.get('b1')?.flag).toBe('pick');
    expect(getStore().imageMap.get('b2')?.flag).toBe('none');
    expect(getStore().imageMap.get('b3')?.flag).toBe('none');
  });

  it('all-rejected detection works via imageMap', () => {
    seedStore({ images: burstImages, bursts: [burst] });
    getStore().setFlag('b1', 'reject');
    getStore().setFlag('b2', 'reject');
    getStore().setFlag('b3', 'reject');
    
    const s = getStore();
    const b = s.normalizedBurstGroups[0];
    const allRejected = b.imageIds.every((id) => s.imageMap.get(id)?.flag === 'reject');
    expect(allRejected).toBe(true);
  });

  it('cover image logic: pick > unflagged > first', () => {
    seedStore({ images: burstImages, bursts: [burst] });
    const s = getStore();
    const b = s.normalizedBurstGroups[0];
    const imgs = b.imageIds.map((id) => s.imageMap.get(id)!);

    // All unflagged: first image
    const cover1 = imgs.find((i) => i.flag === 'pick') || imgs.find((i) => i.flag === 'none') || imgs[0];
    expect(cover1.id).toBe('b1');

    // Pick b2: cover should be b2
    getStore().setFlag('b2', 'pick');
    const s2 = getStore();
    const imgs2 = b.imageIds.map((id) => s2.imageMap.get(id)!);
    const cover2 = imgs2.find((i) => i.flag === 'pick') || imgs2.find((i) => i.flag === 'none') || imgs2[0];
    expect(cover2.id).toBe('b2');

    // Reject b1, unflag b2: cover should be b2 (first unflagged)
    getStore().setFlag('b1', 'reject');
    getStore().setFlag('b2', 'pick'); // toggle off (was pick → none)
    const s3 = getStore();
    const imgs3 = b.imageIds.map((id) => s3.imageMap.get(id)!);
    const cover3 = imgs3.find((i) => i.flag === 'pick') || imgs3.find((i) => i.flag === 'none') || imgs3[0];
    expect(cover3.id).toBe('b2');
  });
});

// ============================================================
// EMPTY STORE EDGE CASES
// ============================================================

describe('empty store', () => {
  it('starts with no images', () => {
    expect(getStore().imageMap.size).toBe(0);
    expect(getStore().imageOrder.length).toBe(0);
  });

  it('flag on empty store is safe', () => {
    getStore().setFlag('nonexistent', 'pick');
    expect(getStore().imageMap.size).toBe(0);
  });

  it('rating on empty store is safe', () => {
    getStore().setRating('nonexistent', 5);
    expect(getStore().imageMap.size).toBe(0);
  });

  it('openLoupe on empty store is safe', () => {
    getStore().openLoupe('nonexistent');
    expect(getStore().loupe.active).toBe(false);
  });

  it('loupeNext on empty store is safe', () => {
    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBeNull();
  });

  it('clearSelection on empty store is safe', () => {
    getStore().clearSelection();
    expect(getStore().selectedIds.size).toBe(0);
  });
});

// ============================================================
// DATA INTEGRITY
// ============================================================

describe('data integrity', () => {
  it('imageOrder matches imageMap keys', () => {
    seedStore();
    const s = getStore();
    expect(s.imageOrder.length).toBe(s.imageMap.size);
    for (const id of s.imageOrder) {
      expect(s.imageMap.has(id)).toBe(true);
    }
  });

  it('imageOrder is sorted by timestamp', () => {
    seedStore();
    const s = getStore();
    for (let i = 1; i < s.imageOrder.length; i++) {
      const prev = s.imageMap.get(s.imageOrder[i - 1])!;
      const curr = s.imageMap.get(s.imageOrder[i])!;
      expect(prev.timestamp).toBeLessThanOrEqual(curr.timestamp);
    }
  });

  it('all burst imageIds exist in imageMap', () => {
    const images = [
      makeImage({ id: 'b1', burstGroupId: 'burst-1', burstIndex: 0 }),
      makeImage({ id: 'b2', burstGroupId: 'burst-1', burstIndex: 1 }),
    ];
    const burst: NormalizedBurstGroup = {
      id: 'burst-1',
      cameraSerial: '3002851',
      imageIds: ['b1', 'b2'],
      frameCount: 2,
      durationMs: 50,
      avgGapMs: 50,
      estimatedFps: 20,
    };
    seedStore({ images, bursts: [burst] });
    
    const s = getStore();
    for (const b of s.normalizedBurstGroups) {
      for (const id of b.imageIds) {
        expect(s.imageMap.has(id)).toBe(true);
      }
    }
  });

  it('burstIndex is consistent with normalizedBurstGroups', () => {
    const images = [
      makeImage({ id: 'b1', burstGroupId: 'burst-1', burstIndex: 0 }),
      makeImage({ id: 'b2', burstGroupId: 'burst-1', burstIndex: 1 }),
      makeImage({ id: 's1' }),
    ];
    const burst: NormalizedBurstGroup = {
      id: 'burst-1',
      cameraSerial: '3002851',
      imageIds: ['b1', 'b2'],
      frameCount: 2,
      durationMs: 50,
      avgGapMs: 50,
      estimatedFps: 20,
    };
    seedStore({ images, bursts: [burst] });
    
    const s = getStore();
    // Burst images are in burstIndex
    expect(s.burstIndex.get('b1')).toBe('burst-1');
    expect(s.burstIndex.get('b2')).toBe('burst-1');
    // Non-burst images are not
    expect(s.burstIndex.has('s1')).toBe(false);
  });

  it('mutations create new Map references (immutability)', () => {
    seedStore();
    const before = getStore().imageMap;
    getStore().setFlag('img-1', 'pick');
    const after = getStore().imageMap;
    expect(before).not.toBe(after);
    // Original map unchanged
    expect(before.get('img-1')?.flag).toBe('none');
    expect(after.get('img-1')?.flag).toBe('pick');
  });
});
