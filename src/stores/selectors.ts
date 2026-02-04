/**
 * Zustand selector hooks for normalized data access.
 *
 * These replace direct access to burstGroups[].images[] with derived
 * lookups through imageMap. Components use these instead of digging
 * into the store directly — this gives targeted re-renders.
 */
import { useImageStore } from './imageStore';
import { ImageEntry, NormalizedBurstGroup } from '../types';

/** Get a single image by ID. Re-renders only when that image changes. */
export function useImage(imageId: string | null): ImageEntry | null {
  return useImageStore((state) =>
    imageId ? state.imageMap.get(imageId) ?? null : null
  );
}

/** Get all images for a burst, in order. */
export function useBurstImages(burstId: string): ImageEntry[] {
  return useImageStore((state) => {
    const burst = state.normalizedBurstGroups.find((b) => b.id === burstId);
    if (!burst) return [];
    return burst.imageIds.map((id) => state.imageMap.get(id)!).filter(Boolean);
  });
}

/** Get burst metadata (without images). */
export function useBurstGroup(burstId: string): NormalizedBurstGroup | null {
  return useImageStore((state) =>
    state.normalizedBurstGroups.find((b) => b.id === burstId) ?? null
  );
}

/** Smart cover image for a burst: first pick > first unflagged > first. */
export function useBurstCover(burstId: string): ImageEntry | null {
  return useImageStore((state) => {
    const burst = state.normalizedBurstGroups.find((b) => b.id === burstId);
    if (!burst) return null;
    const images = burst.imageIds.map((id) => state.imageMap.get(id)!).filter(Boolean);
    return images.find((i) => i.flag === 'pick')
      || images.find((i) => i.flag === 'none')
      || images[0]
      || null;
  });
}

/** Are all images in a burst rejected? */
export function useBurstAllRejected(burstId: string): boolean {
  return useImageStore((state) => {
    const burst = state.normalizedBurstGroups.find((b) => b.id === burstId);
    if (!burst || burst.imageIds.length === 0) return false;
    return burst.imageIds.every((id) => state.imageMap.get(id)?.flag === 'reject');
  });
}

/** Does a burst have any picks? */
export function useBurstHasPicks(burstId: string): boolean {
  return useImageStore((state) => {
    const burst = state.normalizedBurstGroups.find((b) => b.id === burstId);
    if (!burst) return false;
    return burst.imageIds.some((id) => state.imageMap.get(id)?.flag === 'pick');
  });
}

/** Get the burst ID for an image (if any). */
export function useImageBurstId(imageId: string): string | null {
  return useImageStore((state) => state.burstIndex.get(imageId) ?? null);
}

/** Get all images as an ordered array (for components that need the full list). */
export function useOrderedImages(): ImageEntry[] {
  return useImageStore((state) =>
    state.imageOrder.map((id) => state.imageMap.get(id)!).filter(Boolean)
  );
}

/** Get total image count. */
export function useImageCount(): number {
  return useImageStore((state) => state.imageMap.size);
}

/** Get burst count. */
export function useBurstCount(): number {
  return useImageStore((state) => state.normalizedBurstGroups.length);
}
