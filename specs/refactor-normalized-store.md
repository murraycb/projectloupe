# ProjectLoupe — Normalized Store Refactor

## Problem

The current store maintains two parallel collections:
- `images: ImageEntry[]` — flat array for filtering, sorting, global ops
- `burstGroups[].images: ImageEntry[]` — nested copies for burst-level UI

Every mutation (flag, rating, color label, thumbnail URL) must update BOTH via `updateImageProp()`, which:
1. Maps over the entire `images[]` array (O(n))
2. Maps over every burst group AND every image within each group (O(bursts × frames))
3. Creates new array/object references for every burst group on every single-image mutation
4. Causes React to re-render every `<BurstGroup>` component on any flag change anywhere

Additional perf issues:
- App.tsx keyboard handler has 15 deps → re-registers on every state change
- `navItems`/`navRows` recomputes on every flag change (depends on `images`)
- DOM query (`document.querySelector('.thumbnail-grid')`) in useMemo
- `extractThumbnails` rebuilds both arrays entirely

## Solution: Normalized Data Model

### New State Shape

```typescript
interface ImageStore {
  // === Normalized data ===
  imageMap: Map<string, ImageEntry>;     // source of truth for all image data
  imageOrder: string[];                   // display order (sorted by timestamp)
  
  // === Burst groups (ID references only) ===
  burstGroups: BurstGroupData[];          // imageIds: string[] instead of images: ImageEntry[]
  burstIndex: Map<string, string>;        // imageId → burstGroupId (reverse lookup)
  
  // === Camera groups ===
  cameras: CameraGroup[];
  
  // === UI state (unchanged) ===
  selectedIds: Set<string>;
  filters: FilterState;
  overlayMode: OverlayMode;
  loupe: LoupeState;
  isImporting: boolean;
  importError: string | null;
  folderPath: string | null;
}
```

### Updated BurstGroupData

```typescript
interface BurstGroupData {
  id: string;
  cameraSerial: string;
  imageIds: string[];          // was: images: ImageEntry[]
  frameCount: number;
  durationMs: number;
  avgGapMs: number;
  estimatedFps: number;
}
```

### Key Changes

#### 1. Single write path
```typescript
// Before: updateImageProp() — maps both arrays
// After: direct Map mutation
updateImage: (imageId: string, patch: Partial<ImageEntry>) => {
  set((state) => {
    const img = state.imageMap.get(imageId);
    if (!img) return state;
    const newMap = new Map(state.imageMap);
    newMap.set(imageId, { ...img, ...patch });
    return { imageMap: newMap };
  });
}
```

#### 2. Derived burst data via selectors (not stored copies)
```typescript
// Selector: get images for a burst
function useBurstImages(burstId: string): ImageEntry[] {
  return useImageStore((state) => {
    const burst = state.burstGroups.find(b => b.id === burstId);
    if (!burst) return [];
    return burst.imageIds.map(id => state.imageMap.get(id)!);
  });
}

// Selector: burst cover image
function useBurstCover(burstId: string): ImageEntry | null {
  return useImageStore((state) => {
    const burst = state.burstGroups.find(b => b.id === burstId);
    if (!burst) return null;
    const images = burst.imageIds.map(id => state.imageMap.get(id)!);
    return images.find(i => i.flag === 'pick')
        || images.find(i => i.flag === 'none')
        || images[0] || null;
  });
}

// Selector: is burst all-rejected
function useBurstAllRejected(burstId: string): boolean {
  return useImageStore((state) => {
    const burst = state.burstGroups.find(b => b.id === burstId);
    if (!burst) return false;
    return burst.imageIds.every(id => state.imageMap.get(id)?.flag === 'reject');
  });
}
```

#### 3. O(1) image lookups
```typescript
// Before: images.find(img => img.id === imageId) — O(n)
// After:  imageMap.get(imageId) — O(1)
```

#### 4. Targeted re-renders
With selectors, `BurstGroup` only re-renders when its own images' flags change, not when unrelated images are mutated.

### Migration Plan

#### Phase 1: Types + Store Core
1. Update `BurstGroupData` type: `images` → `imageIds`
2. Add `imageMap`, `imageOrder`, `burstIndex` to store state
3. Replace `updateImageProp()` with `updateImage()` 
4. Update `setFlag`, `setRating`, `setColorLabel` to use new write path
5. Update import pipeline (`importFolder`/`importPath`) to populate normalized structures
6. Update `extractThumbnails` to mutate imageMap only

#### Phase 2: Components
7. Create selector hooks: `useBurstImages`, `useBurstCover`, `useBurstAllRejected`, `useImage`
8. Update `BurstGroup.tsx` — use selectors instead of prop drilling `burstGroup.images`
9. Update `ThumbnailGrid.tsx` — use `imageMap` + `imageOrder` for display items
10. Update `LoupeView.tsx` — use `imageMap.get()` instead of `images.find()`
11. Update `ThumbnailCard.tsx` — minimal changes (already receives ImageEntry as prop)
12. Update `MetadataPanel.tsx` — use `imageMap.get()`

#### Phase 3: App.tsx Keyboard Handler
13. Extract keyboard handler into a custom hook (`useGridKeyboardNav`)
14. Compute `navItems`/`navRows` from `imageOrder` + `burstIndex` (no dependency on image flags)
15. Column count via ResizeObserver ref (not DOM query)
16. Minimize effect dependency array

#### Phase 4: Cleanup
17. Remove `expandedBursts` (unused — bursts are always collapsed in grid)
18. Remove `toggleBurstExpand` action
19. Remove `updateImageProp` helper
20. Run full test plan, verify all 80 tests pass

### Files Changed

| File | Changes |
|------|---------|
| `src/types/index.ts` | `BurstGroupData.images` → `imageIds` |
| `src/stores/imageStore.ts` | Major rewrite — normalized state, new actions, selectors |
| `src/stores/selectors.ts` | NEW — zustand selector hooks |
| `src/components/BurstGroup.tsx` | Use selectors |
| `src/components/ThumbnailGrid.tsx` | Use imageOrder + imageMap |
| `src/components/LoupeView.tsx` | Use imageMap.get() |
| `src/components/ThumbnailCard.tsx` | Minor — might receive id instead of full entry |
| `src/components/MetadataPanel.tsx` | Use imageMap.get() |
| `src/components/FilterBar.tsx` | Probably unchanged |
| `src/components/StatusBar.tsx` | Use imageMap.size |
| `src/App.tsx` | Extract keyboard hook, simplify deps |

### Risk Assessment

- **Low risk:** Types, selectors, MetadataPanel, StatusBar, FilterBar
- **Medium risk:** Store rewrite, import pipeline, ThumbnailGrid display items
- **Higher risk:** Keyboard navigation (complex row/column math), loupe state management

### Dev Approach

Incremental — keep the app working at each step:
1. Add `imageMap` alongside existing `images[]`  
2. Wire components one at a time to use `imageMap`
3. Once nothing reads `images[]`, remove it
4. Same pattern for `burstGroups[].images` → `burstGroups[].imageIds`
