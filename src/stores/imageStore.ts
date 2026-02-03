import { create } from 'zustand';
import { ImageEntry, FilterState, OverlayMode } from '../types';
import { generateMockImages } from '../mock/generateMockData';

interface ImageStore {
  images: ImageEntry[];
  selectedIds: Set<string>;
  expandedBursts: Set<string>;
  filters: FilterState;
  overlayMode: OverlayMode;

  setRating: (imageId: string, rating: number) => void;
  setFlag: (imageId: string, flag: 'none' | 'pick' | 'reject') => void;
  setColorLabel: (imageId: string, label: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple') => void;
  toggleSelection: (imageId: string) => void;
  selectRange: (startId: string, endId: string) => void;
  clearSelection: () => void;
  toggleBurstExpand: (burstId: string) => void;
  setFilter: (filterKey: keyof FilterState, value: any) => void;
  clearFilters: () => void;
  importImages: () => void;
  cycleOverlayMode: () => void;
}

const overlayModes: OverlayMode[] = ['none', 'minimal', 'standard', 'full'];

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  selectedIds: new Set(),
  expandedBursts: new Set(),
  overlayMode: 'minimal',
  filters: {
    minRating: 0,
    flags: new Set(),
    colorLabels: new Set(),
    showBurstsOnly: false,
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
    set({ filters: { minRating: 0, flags: new Set(), colorLabels: new Set(), showBurstsOnly: false } });
  },

  importImages: () => {
    set({ images: generateMockImages() });
  },

  cycleOverlayMode: () => {
    set((state) => {
      const idx = overlayModes.indexOf(state.overlayMode);
      return { overlayMode: overlayModes[(idx + 1) % overlayModes.length] };
    });
  },
}));
