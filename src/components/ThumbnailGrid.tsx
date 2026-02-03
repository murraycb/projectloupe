import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useEffect, useState } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry, BurstGroupData } from '../types';
import ThumbnailCard from './ThumbnailCard';
import BurstGroup from './BurstGroup';
import IngestPanel from './IngestPanel';
import './ThumbnailGrid.css';

type DisplayItem = {
  type: 'image' | 'burst';
  data: ImageEntry | BurstGroupData;
  id: string;
};

function ThumbnailGrid() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(5);
  const { images, filters, expandedBursts } = useImageStore();

  // Responsive column count
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.clientWidth;
        setColumns(Math.max(2, Math.floor(width / 216))); // 200px + 16px gap
      }
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (parentRef.current) observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);

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
        const burstImages = filteredImages.filter(img => img.burstGroupId === image.burstGroupId);
        const isExpanded = expandedBursts.has(image.burstGroupId);

        if (isExpanded) {
          burstImages.forEach(img => {
            items.push({ type: 'image', data: img, id: img.id });
          });
        } else {
          items.push({
            type: 'burst',
            data: { id: image.burstGroupId, images: burstImages, expanded: false },
            id: image.burstGroupId,
          });
        }
        processedBursts.add(image.burstGroupId);
      } else if (!image.burstGroupId) {
        items.push({ type: 'image', data: image, id: image.id });
      }
    }

    return items;
  }, [filteredImages, expandedBursts]);

  const ITEM_HEIGHT = 250;

  const virtualizer = useVirtualizer({
    count: Math.ceil(displayItems.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 3,
  });

  // Empty state — show IngestPanel inline
  if (images.length === 0) {
    return (
      <div ref={parentRef} className="thumbnail-grid">
        <IngestPanel />
      </div>
    );
  }

  // No results from filters
  if (displayItems.length === 0) {
    return (
      <div ref={parentRef} className="thumbnail-grid">
        <div className="empty-state">
          <p className="empty-title">No images match filters</p>
          <p className="empty-hint">Try adjusting or clearing your filters</p>
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
          const startIndex = virtualRow.index * columns;
          const rowItems = displayItems.slice(startIndex, startIndex + columns);

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
