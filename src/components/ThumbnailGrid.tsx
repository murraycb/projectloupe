import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useEffect, useState } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry, BurstGroupData } from '../types';
import ThumbnailCard from './ThumbnailCard';
import BurstGroup from './BurstGroup';
import IngestPanel from './IngestPanel';
import './ThumbnailGrid.css';

type DisplayItem = {
  type: 'image' | 'burst' | 'camera-header';
  data: ImageEntry | BurstGroupData | { serial: string; label: string; count: number };
  id: string;
};

function ThumbnailGrid() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(5);
  const { images, burstGroups, cameras, filters, expandedBursts } = useImageStore();

  // Responsive column count
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.clientWidth;
        setColumns(Math.max(2, Math.floor(width / 216)));
      }
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (parentRef.current) observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter images
  const filteredImages = useMemo(() => {
    return images.filter((image) => {
      if (image.rating < filters.minRating) return false;
      if (filters.flags.size > 0 && !filters.flags.has(image.flag)) return false;
      if (filters.colorLabels.size > 0 && !filters.colorLabels.has(image.colorLabel)) return false;
      if (filters.showBurstsOnly && !image.burstGroupId) return false;
      if (filters.cameraSerial && image.serialNumber !== filters.cameraSerial) return false;
      return true;
    });
  }, [images, filters]);

  // Build display items: camera sections with bursts and singles
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    const processedBursts = new Set<string>();
    const showCameraHeaders = cameras.length > 1;

    if (showCameraHeaders) {
      // Group by camera serial
      const byCamera = new Map<string, ImageEntry[]>();
      for (const img of filteredImages) {
        const list = byCamera.get(img.serialNumber) || [];
        list.push(img);
        byCamera.set(img.serialNumber, list);
      }

      for (const [serial, cameraImages] of byCamera) {
        const cam = cameras.find((c) => c.serial === serial);
        const label = cam ? `${cam.make} ${cam.model}` : serial;

        items.push({
          type: 'camera-header',
          data: { serial, label, count: cameraImages.length },
          id: `camera-${serial}`,
        });

        addImagesAsItems(cameraImages, items, processedBursts);
      }
    } else {
      addImagesAsItems(filteredImages, items, processedBursts);
    }

    return items;
  }, [filteredImages, expandedBursts, cameras, burstGroups]);

  function addImagesAsItems(
    imageList: ImageEntry[],
    items: DisplayItem[],
    processedBursts: Set<string>,
  ) {
    for (const image of imageList) {
      if (image.burstGroupId && !processedBursts.has(image.burstGroupId)) {
        const burst = burstGroups.find((b) => b.id === image.burstGroupId);
        if (burst) {
          const isExpanded = expandedBursts.has(burst.id);

          if (isExpanded) {
            // Filter burst images through current filters
            const filteredBurstImages = burst.images.filter((img) => {
              if (img.rating < filters.minRating) return false;
              if (filters.flags.size > 0 && !filters.flags.has(img.flag)) return false;
              if (filters.colorLabels.size > 0 && !filters.colorLabels.has(img.colorLabel)) return false;
              return true;
            });
            filteredBurstImages.forEach((img) => {
              items.push({ type: 'image', data: img, id: img.id });
            });
          } else {
            items.push({
              type: 'burst',
              data: { ...burst, expanded: false },
              id: burst.id,
            });
          }
        }
        processedBursts.add(image.burstGroupId);
      } else if (!image.burstGroupId) {
        items.push({ type: 'image', data: image, id: image.id });
      }
    }
  }

  const ITEM_HEIGHT = 250;
  const HEADER_HEIGHT = 48;

  // Calculate row data — camera headers take full width
  const rows = useMemo(() => {
    const result: { items: DisplayItem[]; height: number }[] = [];
    let currentRow: DisplayItem[] = [];

    for (const item of displayItems) {
      if (item.type === 'camera-header') {
        // Flush current row
        if (currentRow.length > 0) {
          result.push({ items: currentRow, height: ITEM_HEIGHT });
          currentRow = [];
        }
        result.push({ items: [item], height: HEADER_HEIGHT });
      } else {
        currentRow.push(item);
        if (currentRow.length >= columns) {
          result.push({ items: currentRow, height: ITEM_HEIGHT });
          currentRow = [];
        }
      }
    }
    if (currentRow.length > 0) {
      result.push({ items: currentRow, height: ITEM_HEIGHT });
    }
    return result;
  }, [displayItems, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => rows[i]?.height ?? ITEM_HEIGHT,
    overscan: 3,
  });

  // Empty state
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
          const row = rows[virtualRow.index];
          if (!row) return null;

          const isHeader = row.items.length === 1 && row.items[0].type === 'camera-header';

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
              {isHeader ? (
                <div className="camera-header">
                  <span className="camera-label">
                    {(row.items[0].data as any).label}
                  </span>
                  <span className="camera-count">
                    {(row.items[0].data as any).count} images
                  </span>
                </div>
              ) : (
                <div className="grid-row">
                  {row.items.map((item) => (
                    <div key={item.id} className="grid-cell">
                      {item.type === 'image' ? (
                        <ThumbnailCard image={item.data as ImageEntry} />
                      ) : (
                        <BurstGroup burstGroup={item.data as BurstGroupData} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ThumbnailGrid;
