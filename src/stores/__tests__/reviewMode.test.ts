/**
 * Review mode workflow tests.
 *
 * These test the interaction patterns that matter in a real culling workflow:
 * - Filtering to picks/rejects/ratings → navigating → flagging → selection state
 * - Loupe behavior under filters
 * - Edge cases: last image filtered out, all images filtered out, etc.
 *
 * Review mode = any content filter active (minRating, flags, colorLabels).
 * In review mode: bursts flatten, flagging is individual, navigation follows filters.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useImageStore } from '../imageStore';
import { ImageEntry, NormalizedBurstGroup } from '../../types';

// -- Helpers --

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
    exif: {
      iso: 800, aperture: 4.5, shutterSpeed: '1/3200',
      focalLength: 500, camera: 'NIKON Z 9', lens: 'VR 500mm f/4E',
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

function makeBurst(id: string, imageIds: string[]): NormalizedBurstGroup {
  return {
    id,
    cameraSerial: '3002851',
    imageIds,
    frameCount: imageIds.length,
    durationMs: imageIds.length * 50,
    avgGapMs: 50,
    estimatedFps: 20,
  };
}

function seedStore(opts: { images?: ImageEntry[]; bursts?: NormalizedBurstGroup[] } = {}) {
  const images = opts.images || [];
  const imageMap = new Map(images.map((img) => [img.id, img]));
  const imageOrder = [...images].sort((a, b) => a.timestamp - b.timestamp).map((img) => img.id);
  const burstIndex = new Map<string, string>();
  for (const burst of opts.bursts || []) {
    for (const id of burst.imageIds) burstIndex.set(id, burst.id);
  }

  useImageStore.setState({
    imageMap,
    imageOrder,
    normalizedBurstGroups: opts.bursts || [],
    burstIndex,
    cameras: [],
    selectedIds: new Set(),
    filters: { minRating: 0, flags: new Set(), colorLabels: new Set(), showBurstsOnly: false, cameraSerial: null },
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

/** Helper: check which image IDs pass the current filters. */
function getFilteredIds(): string[] {
  const s = getStore();
  return s.imageOrder.filter((id) => {
    const img = s.imageMap.get(id);
    if (!img) return false;
    if (img.rating < s.filters.minRating) return false;
    if (s.filters.flags.size > 0 && !s.filters.flags.has(img.flag)) return false;
    if (s.filters.colorLabels.size > 0 && !s.filters.colorLabels.has(img.colorLabel)) return false;
    if (s.filters.showBurstsOnly && !img.burstGroupId) return false;
    if (s.filters.cameraSerial && img.serialNumber !== s.filters.cameraSerial) return false;
    return true;
  });
}

/** Helper: check if review mode is active (matches App.tsx logic). */
function isReviewMode(): boolean {
  const f = getStore().filters;
  return f.minRating > 0 || f.flags.size > 0 || f.colorLabels.size > 0;
}

// -- Reset --

beforeEach(() => {
  useImageStore.setState({
    imageMap: new Map(),
    imageOrder: [],
    normalizedBurstGroups: [],
    burstIndex: new Map(),
    cameras: [],
    selectedIds: new Set(),
    filters: { minRating: 0, flags: new Set(), colorLabels: new Set(), showBurstsOnly: false, cameraSerial: null },
    overlayMode: 'minimal',
    isImporting: false,
    importError: null,
    folderPath: null,
    loupe: { active: false, imageId: null, burstId: null, loupeUrls: {} },
  });
});

// ============================================================
// REVIEW MODE DETECTION
// ============================================================

describe('review mode detection', () => {
  it('no filters = not review mode', () => {
    seedStore();
    expect(isReviewMode()).toBe(false);
  });

  it('flag filter = review mode', () => {
    seedStore();
    getStore().setFilter('flags', new Set(['pick']));
    expect(isReviewMode()).toBe(true);
  });

  it('rating filter = review mode', () => {
    seedStore();
    getStore().setFilter('minRating', 3);
    expect(isReviewMode()).toBe(true);
  });

  it('color label filter = review mode', () => {
    seedStore();
    getStore().setFilter('colorLabels', new Set(['red']));
    expect(isReviewMode()).toBe(true);
  });

  it('showBurstsOnly alone = NOT review mode (culling filter)', () => {
    seedStore();
    getStore().setFilter('showBurstsOnly', true);
    expect(isReviewMode()).toBe(false);
  });

  it('cameraSerial alone = NOT review mode', () => {
    seedStore();
    getStore().setFilter('cameraSerial', '3002851');
    expect(isReviewMode()).toBe(false);
  });
});

// ============================================================
// FILTERING — BURST FLATTENING
// ============================================================

describe('filtering flattens bursts in review mode', () => {
  const burstImgs = [
    makeImage({ id: 'b1', timestamp: 1000, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 0 }),
    makeImage({ id: 'b2', timestamp: 1050, flag: 'none', burstGroupId: 'burst-1', burstIndex: 1 }),
    makeImage({ id: 'b3', timestamp: 1100, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 2 }),
  ];
  const burst = makeBurst('burst-1', ['b1', 'b2', 'b3']);
  const single = makeImage({ id: 's1', timestamp: 2000, flag: 'pick' });

  it('pick filter shows only picked images from bursts as individuals', () => {
    seedStore({ images: [...burstImgs, single], bursts: [burst] });
    getStore().setFilter('flags', new Set(['pick']));

    const filtered = getFilteredIds();
    expect(filtered).toEqual(['b1', 'b3', 's1']);
    // b2 (unflagged) excluded; b1 and b3 are individual, not grouped
  });

  it('reject filter excludes non-rejected burst members', () => {
    seedStore({
      images: [
        makeImage({ id: 'b1', timestamp: 1000, flag: 'reject', burstGroupId: 'burst-1', burstIndex: 0 }),
        makeImage({ id: 'b2', timestamp: 1050, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 1 }),
        makeImage({ id: 'b3', timestamp: 1100, flag: 'reject', burstGroupId: 'burst-1', burstIndex: 2 }),
      ],
      bursts: [burst],
    });
    getStore().setFilter('flags', new Set(['reject']));

    const filtered = getFilteredIds();
    expect(filtered).toEqual(['b1', 'b3']);
  });

  it('rating filter works across burst and single images', () => {
    seedStore({
      images: [
        makeImage({ id: 'b1', timestamp: 1000, rating: 3, burstGroupId: 'burst-1', burstIndex: 0 }),
        makeImage({ id: 'b2', timestamp: 1050, rating: 1, burstGroupId: 'burst-1', burstIndex: 1 }),
        makeImage({ id: 's1', timestamp: 2000, rating: 5 }),
        makeImage({ id: 's2', timestamp: 3000, rating: 2 }),
      ],
      bursts: [makeBurst('burst-1', ['b1', 'b2'])],
    });
    getStore().setFilter('minRating', 3);

    const filtered = getFilteredIds();
    expect(filtered).toEqual(['b1', 's1']);
  });

  it('color label filter works', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, colorLabel: 'red' }),
        makeImage({ id: 'b', timestamp: 2000, colorLabel: 'blue' }),
        makeImage({ id: 'c', timestamp: 3000, colorLabel: 'red' }),
        makeImage({ id: 'd', timestamp: 4000, colorLabel: 'none' }),
      ],
    });
    getStore().setFilter('colorLabels', new Set(['red']));

    const filtered = getFilteredIds();
    expect(filtered).toEqual(['a', 'c']);
  });
});

// ============================================================
// LOUPE — REVIEW MODE BEHAVIOR
// ============================================================

describe('loupe in review mode', () => {
  const images = [
    makeImage({ id: 'p1', timestamp: 1000, flag: 'pick' }),
    makeImage({ id: 'n1', timestamp: 2000, flag: 'none' }),
    makeImage({ id: 'p2', timestamp: 3000, flag: 'pick' }),
    makeImage({ id: 'n2', timestamp: 4000, flag: 'none' }),
    makeImage({ id: 'p3', timestamp: 5000, flag: 'pick' }),
  ];

  it('openLoupe in review mode does NOT scope to burst', () => {
    const burstImgs = [
      makeImage({ id: 'b1', timestamp: 1000, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 0 }),
      makeImage({ id: 'b2', timestamp: 1050, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 1 }),
    ];
    seedStore({ images: burstImgs, bursts: [makeBurst('burst-1', ['b1', 'b2'])] });
    getStore().setFilter('flags', new Set(['pick']));

    getStore().openLoupe('b1');
    expect(getStore().loupe.burstId).toBeNull(); // NOT burst-scoped
    expect(getStore().loupe.active).toBe(true);
  });

  it('openLoupe on single in default mode does NOT give filmstrip of all images', () => {
    seedStore({ images });
    // No filters = default mode, but opening a single (non-burst) image
    getStore().openLoupe('p1');
    // burstId should be null since p1 is not in a burst
    expect(getStore().loupe.burstId).toBeNull();
    expect(getStore().loupe.active).toBe(true);
    expect(getStore().loupe.imageId).toBe('p1');
  });

  it('loupe navigation in review mode only traverses filtered images', () => {
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));

    getStore().openLoupe('p1');
    expect(getStore().loupe.imageId).toBe('p1');

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('p2');

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('p3');

    // At end — stays on p3
    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('p3');
  });

  it('loupe prev in review mode only traverses filtered images', () => {
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));

    getStore().openLoupe('p3');
    // openLoupe on non-burst with review mode starts on p3 directly
    useImageStore.setState((s) => ({ loupe: { ...s.loupe, imageId: 'p3' } }));

    getStore().loupePrev();
    expect(getStore().loupe.imageId).toBe('p2');

    getStore().loupePrev();
    expect(getStore().loupe.imageId).toBe('p1');

    // At start — stays on p1
    getStore().loupePrev();
    expect(getStore().loupe.imageId).toBe('p1');
  });
});

// ============================================================
// LOUPE — BURST SCOPING IN DEFAULT MODE
// ============================================================

describe('loupe burst scoping in default mode', () => {
  const burstImgs = [
    makeImage({ id: 'b1', timestamp: 1000, burstGroupId: 'burst-1', burstIndex: 0 }),
    makeImage({ id: 'b2', timestamp: 1050, burstGroupId: 'burst-1', burstIndex: 1 }),
    makeImage({ id: 'b3', timestamp: 1100, burstGroupId: 'burst-1', burstIndex: 2 }),
  ];
  const burst = makeBurst('burst-1', ['b1', 'b2', 'b3']);
  const single = makeImage({ id: 's1', timestamp: 5000 });

  it('opening burst image in default mode scopes to burst', () => {
    seedStore({ images: [...burstImgs, single], bursts: [burst] });
    getStore().openLoupe('b2');
    expect(getStore().loupe.burstId).toBe('burst-1');
  });

  it('navigation in burst-scoped loupe stays within burst', () => {
    seedStore({ images: [...burstImgs, single], bursts: [burst] });
    getStore().openLoupe('b1');
    // Smart start on b1 (first unflagged)
    expect(getStore().loupe.imageId).toBe('b1');

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('b2');
    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('b3');
    // Does NOT navigate to s1
    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('b3');
  });
});

// ============================================================
// FLAG TOGGLE IN REVIEW MODE — INDIVIDUAL BEHAVIOR
// ============================================================

describe('flagging in review mode is individual', () => {
  it('flagging a burst member does not flag siblings', () => {
    const burstImgs = [
      makeImage({ id: 'b1', timestamp: 1000, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 0 }),
      makeImage({ id: 'b2', timestamp: 1050, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 1 }),
      makeImage({ id: 'b3', timestamp: 1100, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 2 }),
    ];
    seedStore({ images: burstImgs, bursts: [makeBurst('burst-1', ['b1', 'b2', 'b3'])] });
    getStore().setFilter('flags', new Set(['pick']));

    // Toggle b1's pick off (should become 'none')
    getStore().setFlag('b1', 'pick');
    expect(getStore().imageMap.get('b1')?.flag).toBe('none');
    // Siblings unchanged
    expect(getStore().imageMap.get('b2')?.flag).toBe('pick');
    expect(getStore().imageMap.get('b3')?.flag).toBe('pick');
  });
});

// ============================================================
// MUTATION DROPS IMAGE FROM FILTER — SELECTION STATE
// ============================================================

describe('mutation removes image from filter view', () => {
  it('unpicking a pick removes it from pick filter results', () => {
    const images = [
      makeImage({ id: 'p1', timestamp: 1000, flag: 'pick' }),
      makeImage({ id: 'p2', timestamp: 2000, flag: 'pick' }),
      makeImage({ id: 'p3', timestamp: 3000, flag: 'pick' }),
    ];
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));

    expect(getFilteredIds()).toEqual(['p1', 'p2', 'p3']);

    // Toggle p2's pick off
    getStore().setFlag('p2', 'pick');
    expect(getStore().imageMap.get('p2')?.flag).toBe('none');
    expect(getFilteredIds()).toEqual(['p1', 'p3']);
  });

  it('rating below threshold removes from rating filter', () => {
    const images = [
      makeImage({ id: 'a', timestamp: 1000, rating: 3 }),
      makeImage({ id: 'b', timestamp: 2000, rating: 4 }),
      makeImage({ id: 'c', timestamp: 3000, rating: 5 }),
    ];
    seedStore({ images });
    getStore().setFilter('minRating', 3);

    expect(getFilteredIds()).toEqual(['a', 'b', 'c']);

    // Drop rating of 'a' below threshold
    getStore().setRating('a', 2);
    expect(getFilteredIds()).toEqual(['b', 'c']);
  });

  it('changing color label removes from label filter', () => {
    const images = [
      makeImage({ id: 'a', timestamp: 1000, colorLabel: 'red' }),
      makeImage({ id: 'b', timestamp: 2000, colorLabel: 'red' }),
    ];
    seedStore({ images });
    getStore().setFilter('colorLabels', new Set(['red']));

    expect(getFilteredIds()).toEqual(['a', 'b']);

    getStore().setColorLabel('a', 'blue');
    expect(getFilteredIds()).toEqual(['b']);
  });

  it('rejecting a pick removes it from pick filter', () => {
    const images = [
      makeImage({ id: 'p1', timestamp: 1000, flag: 'pick' }),
      makeImage({ id: 'p2', timestamp: 2000, flag: 'pick' }),
    ];
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));

    getStore().setFlag('p1', 'reject');
    expect(getStore().imageMap.get('p1')?.flag).toBe('reject');
    expect(getFilteredIds()).toEqual(['p2']);
  });
});

// ============================================================
// COMBINED FILTERS
// ============================================================

describe('combined filters', () => {
  it('flag + rating filter narrows results', () => {
    const images = [
      makeImage({ id: 'a', timestamp: 1000, flag: 'pick', rating: 5 }),
      makeImage({ id: 'b', timestamp: 2000, flag: 'pick', rating: 2 }),
      makeImage({ id: 'c', timestamp: 3000, flag: 'none', rating: 5 }),
      makeImage({ id: 'd', timestamp: 4000, flag: 'pick', rating: 4 }),
    ];
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));
    getStore().setFilter('minRating', 4);

    const filtered = getFilteredIds();
    expect(filtered).toEqual(['a', 'd']);
  });

  it('flag + color label filter', () => {
    const images = [
      makeImage({ id: 'a', timestamp: 1000, flag: 'pick', colorLabel: 'red' }),
      makeImage({ id: 'b', timestamp: 2000, flag: 'pick', colorLabel: 'blue' }),
      makeImage({ id: 'c', timestamp: 3000, flag: 'none', colorLabel: 'red' }),
    ];
    seedStore({ images });
    getStore().setFilter('flags', new Set(['pick']));
    getStore().setFilter('colorLabels', new Set(['red']));

    expect(getFilteredIds()).toEqual(['a']);
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe('edge cases', () => {
  it('filtering to empty set produces no results', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'none' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
      ],
    });
    getStore().setFilter('flags', new Set(['pick']));
    expect(getFilteredIds()).toEqual([]);
  });

  it('single image passes filter, rest do not', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'pick' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
        makeImage({ id: 'c', timestamp: 3000, flag: 'reject' }),
      ],
    });
    getStore().setFilter('flags', new Set(['pick']));
    expect(getFilteredIds()).toEqual(['a']);
  });

  it('loupe navigation with single filtered image stays on it', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'pick' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
      ],
    });
    getStore().setFilter('flags', new Set(['pick']));

    getStore().openLoupe('a');
    expect(getStore().loupe.imageId).toBe('a');

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('a'); // nowhere to go

    getStore().loupePrev();
    expect(getStore().loupe.imageId).toBe('a'); // nowhere to go
  });

  it('clearing filters restores all images', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'pick' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
        makeImage({ id: 'c', timestamp: 3000, flag: 'reject' }),
      ],
    });
    getStore().setFilter('flags', new Set(['pick']));
    expect(getFilteredIds()).toEqual(['a']);

    getStore().clearFilters();
    expect(getFilteredIds()).toEqual(['a', 'b', 'c']);
    expect(isReviewMode()).toBe(false);
  });

  it('opening loupe on image not in filter set still works', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'pick' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
      ],
    });
    getStore().setFilter('flags', new Set(['pick']));

    // Force open on unflagged image (shouldn't happen in normal UI, but be safe)
    getStore().openLoupe('b');
    expect(getStore().loupe.active).toBe(true);
    expect(getStore().loupe.imageId).toBe('b');
  });

  it('multiple rapid flag toggles maintain consistent state', () => {
    seedStore({
      images: [
        makeImage({ id: 'a', timestamp: 1000, flag: 'none' }),
        makeImage({ id: 'b', timestamp: 2000, flag: 'none' }),
      ],
    });

    // Pick, unpick, pick, reject
    getStore().setFlag('a', 'pick');
    expect(getStore().imageMap.get('a')?.flag).toBe('pick');

    getStore().setFlag('a', 'pick'); // toggle off
    expect(getStore().imageMap.get('a')?.flag).toBe('none');

    getStore().setFlag('a', 'pick'); // toggle on
    expect(getStore().imageMap.get('a')?.flag).toBe('pick');

    getStore().setFlag('a', 'reject'); // switch to reject
    expect(getStore().imageMap.get('a')?.flag).toBe('reject');
  });

  it('burst images mixed picks and rejects with pick filter', () => {
    const burstImgs = [
      makeImage({ id: 'b1', timestamp: 1000, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 0 }),
      makeImage({ id: 'b2', timestamp: 1050, flag: 'reject', burstGroupId: 'burst-1', burstIndex: 1 }),
      makeImage({ id: 'b3', timestamp: 1100, flag: 'pick', burstGroupId: 'burst-1', burstIndex: 2 }),
      makeImage({ id: 'b4', timestamp: 1150, flag: 'none', burstGroupId: 'burst-1', burstIndex: 3 }),
    ];
    seedStore({ images: burstImgs, bursts: [makeBurst('burst-1', ['b1', 'b2', 'b3', 'b4'])] });
    getStore().setFilter('flags', new Set(['pick']));

    // Only picks visible
    expect(getFilteredIds()).toEqual(['b1', 'b3']);

    // Navigate in loupe — should only traverse b1 and b3
    getStore().openLoupe('b1');
    expect(getStore().loupe.burstId).toBeNull(); // review mode, no burst scope

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('b3');

    getStore().loupeNext();
    expect(getStore().loupe.imageId).toBe('b3'); // end of filtered set
  });
});
