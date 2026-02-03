import { create } from 'zustand';
import { ImageEntry, FilterState } from '../types';
import { generateMockImages } from '../mock/generateMockData';

interface ImageStore {
  // State
  images: ImageEntry[];
  selectedIds: Set<string>;
  expandedBursts: Set<string>;
  filters: FilterState;
  isImportPanelVisible: boolean;

  // Actions
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
  hideImportPanel: () => void;
}

export const useImageStore = create<ImageStore>((set, get) => ({
  // Initial state
  images: [],
  selectedIds: new Set(),
  expandedBursts: new Set(),
  isImportPanelVisible: true,
  filters: {
    minRating: 0,
    flags: new Set(),
    colorLabels: new Set(),
    showBurstsOnly: false,
  },

  // Actions
  setRating: (imageId: string, rating: number) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, rating } : img
      ),
    }));
  },

  setFlag: (imageId: string, flag: 'none' | 'pick' | 'reject') => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, flag } : img
      ),
    }));
  },

  setColorLabel: (imageId: string, label: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple') => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, colorLabel: label } : img
      ),
    }));
  },

  toggleSelection: (imageId: string) => {
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

  selectRange: (startId: string, endId: string) => {
    const { images, selectedIds } = get();
    const startIndex = images.findIndex((img) => img.id === startId);
    const endIndex = images.findIndex((img) => img.id === endId);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    
    const newSelectedIds = new Set(selectedIds);
    for (let i = minIndex; i <= maxIndex; i++) {
      newSelectedIds.add(images[i].id);
    }
    
    set({ selectedIds: newSelectedIds });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  toggleBurstExpand: (burstId: string) => {
    set((state) => {
      const newExpandedBursts = new Set(state.expandedBursts);
      if (newExpandedBursts.has(burstId)) {
        newExpandedBursts.delete(burstId);
      } else {
        newExpandedBursts.add(burstId);
      }
      return { expandedBursts: newExpandedBursts };
    });
  },

  setFilter: (filterKey: keyof FilterState, value: any) => {
    set((state) => ({
      filters: { ...state.filters, [filterKey]: value },
    }));
  },

  clearFilters: () => {
    set({
      filters: {
        minRating: 0,
        flags: new Set(),
        colorLabels: new Set(),
        showBurstsOnly: false,
      },
    });
  },

  importImages: () => {
    const mockImages = generateMockImages();
    set({
      images: mockImages,
      isImportPanelVisible: false,
    });
  },

  hideImportPanel: () => {
    set({ isImportPanelVisible: false });
  },
}));