import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry, BurstGroupData } from '../types';
import ThumbnailCard from './ThumbnailCard';
import BurstGroup from './BurstGroup';
import './ThumbnailGrid.css';

type DisplayItem = {
  type: 'image' | 'burst';
  data: ImageEntry | BurstGroupData;
  id: string;
};

function ThumbnailGrid() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { images, filters, expandedBursts } = useImageStore();

  // Filter images
  const filteredImages = useMemo(() => {
    return images.filter(image => {
      if (image.rating < filters.minRating) return false;
      if (filters.flags.size > 0 && !filters.flags.has(image.flag)) return false;
      if (filters.colorLabels.size > 0 && !filters.colorLabels.has(image.colorLabel)) return false;
      if (filters.showBurstsOnly && !image.burstGroupId) return false;
      return true;
    });
  }, [images, filters]);

  // Group images by bursts and create display items
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    const processedBursts = new Set<string>();

    for (const image of filteredImages) {
      if (image.burstGroupId && !processedBursts.has(image.burstGroupId)) {
        // This is part of a burst group
        const burstImages = filteredImages.filter(img => img.burstGroupId === image.burstGroupId);
        const isExpanded = expandedBursts.has(image.burstGroupId);

        if (isExpanded) {
          // Show all images in the burst individually
          burstImages.forEach(img => {
            items.push({
              type: 'image',
              data: img,
              id: img.id,
            });
          });
        } else {
          // Show as a single burst group
          items.push({
            type: 'burst',
            data: {
              id: image.burstGroupId,
              images: burstImages,
              expanded: false,
            },
            id: image.burstGroupId,
          });
        }
        processedBursts.add(image.burstGroupId);
      } else if (!image.burstGroupId) {
        // Single image
        items.push({
          type: 'image',
          data: image as ImageEntry,
          id: image.id,
        });
      }
    }

    return items;
  }, [filteredImages, expandedBursts]);

  // Calculate grid layout
  const COLUMNS = Math.floor((parentRef.current?.clientWidth || 1200) / 208); // 200px + 8px gap
  const ITEM_HEIGHT = 250; // Height of each grid item

  const virtualizer = useVirtualizer({
    count: Math.ceil(displayItems.length / COLUMNS),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 3,
  });

  if (images.length === 0) {
    return (
      <div className="thumbnail-grid empty">
        <div className="empty-state">
          <p>No images loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="thumbnail-grid">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * COLUMNS;
          const rowItems = displayItems.slice(startIndex, startIndex + COLUMNS);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid-row">
                {rowItems.map((item) => (
                  <div key={item.id} className="grid-cell">
                    {item.type === 'image' ? (
                      <ThumbnailCard image={item.data as ImageEntry} />
                    ) : (
                      <BurstGroup burstGroup={item.data as BurstGroupData} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ThumbnailGrid;