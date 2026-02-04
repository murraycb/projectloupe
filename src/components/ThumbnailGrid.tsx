import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useEffect, useState } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import ThumbnailCard from './ThumbnailCard';
import BurstGroup from './BurstGroup';
import IngestPanel from './IngestPanel';
import './ThumbnailGrid.css';

type DisplayItem =
  | { type: 'image'; id: string; data: ImageEntry }
  | { type: 'burst'; id: string; burstId: string }
  | { type: 'burst-frame'; id: string; data: ImageEntry; burstId: string }
  | { type: 'camera-header'; id: string; data: { serial: string; label: string; count: number } };

function ThumbnailGrid() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(5);
  const { imageMap, imageOrder, normalizedBurstGroups, cameras, filters, thumbnailSize, expandedBursts } = useImageStore();

  // Responsive column count — derived from thumbnailSize
  const cellWidth = thumbnailSize + 16; // thumbnail + gap/padding
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const width = parentRef.current.clientWidth;
        setColumns(Math.max(2, Math.floor(width / cellWidth)));
      }
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (parentRef.current) observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, [cellWidth]);

  // Filter images
  const filteredIds = useMemo(() => {
    return imageOrder.filter((id) => {
      const image = imageMap.get(id);
      if (!image) return false;
      if (image.rating < filters.minRating) return false;
      if (filters.flags.size > 0 && !filters.flags.has(image.flag)) return false;
      if (filters.colorLabels.size > 0 && !filters.colorLabels.has(image.colorLabel)) return false;
      if (filters.showBurstsOnly && !image.burstGroupId) return false;
      if (filters.cameraSerial && image.serialNumber !== filters.cameraSerial) return false;
      return true;
    });
  }, [imageMap, imageOrder, filters]);

  // Review mode: any filter active → flatten bursts to individual images
  const isReviewMode = useMemo(() => {
    return filters.minRating > 0 || filters.flags.size > 0 || filters.colorLabels.size > 0;
  }, [filters]);

  // Build display items: camera sections with bursts and singles
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    const processedBursts = new Set<string>();
    const showCameraHeaders = cameras.length > 1;

    if (showCameraHeaders) {
      const byCamera = new Map<string, string[]>();
      for (const id of filteredIds) {
        const img = imageMap.get(id)!;
        const list = byCamera.get(img.serialNumber) || [];
        list.push(id);
        byCamera.set(img.serialNumber, list);
      }

      for (const [serial, cameraImageIds] of byCamera) {
        const cam = cameras.find((c) => c.serial === serial);
        const label = cam ? `${cam.make} ${cam.model}` : serial;

        items.push({
          type: 'camera-header',
          data: { serial, label, count: cameraImageIds.length },
          id: `camera-${serial}`,
        });

        addImagesAsItems(cameraImageIds, items, processedBursts);
      }
    } else {
      addImagesAsItems(filteredIds, items, processedBursts);
    }

    return items;
  }, [filteredIds, cameras, normalizedBurstGroups, imageMap, isReviewMode, expandedBursts]);

  function addImagesAsItems(
    imageIds: string[],
    items: DisplayItem[],
    processedBursts: Set<string>,
  ) {
    for (const id of imageIds) {
      const img = imageMap.get(id)!;

      // Review mode: always show individual images (no burst grouping)
      if (isReviewMode) {
        items.push({ type: 'image', data: img, id: img.id });
        continue;
      }

      if (img.burstGroupId && !processedBursts.has(img.burstGroupId)) {
        const burst = normalizedBurstGroups.find((b) => b.id === img.burstGroupId);
        if (burst) {
          items.push({
            type: 'burst',
            id: burst.id,
            burstId: burst.id,
          });
          // If burst is expanded, add individual frames after the stack
          if (expandedBursts.has(burst.id)) {
            for (const frameId of burst.imageIds) {
              const frameImg = imageMap.get(frameId);
              if (frameImg) {
                items.push({ type: 'burst-frame', data: frameImg, id: frameImg.id, burstId: burst.id });
              }
            }
          }
        }
        processedBursts.add(img.burstGroupId);
      } else if (!img.burstGroupId) {
        items.push({ type: 'image', data: img, id: img.id });
      }
    }
  }

  // Scale row height proportionally with thumbnail size
  const ITEM_HEIGHT = Math.round(thumbnailSize * 1.25);
  const HEADER_HEIGHT = 48;

  const rows = useMemo(() => {
    const result: { items: DisplayItem[]; height: number }[] = [];
    let currentRow: DisplayItem[] = [];

    for (const item of displayItems) {
      if (item.type === 'camera-header') {
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
  if (imageMap.size === 0) {
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
                    {(row.items[0] as any).data.label}
                  </span>
                  <span className="camera-count">
                    {(row.items[0] as any).data.count} images
                  </span>
                </div>
              ) : (
                <div className="grid-row">
                  {row.items.map((item) => (
                    <div key={item.id} className="grid-cell" style={{ width: thumbnailSize }}>
                      {item.type === 'image' ? (
                        <ThumbnailCard image={item.data} />
                      ) : item.type === 'burst' ? (
                        <BurstGroup burstId={item.burstId} />
                      ) : item.type === 'burst-frame' ? (
                        <ThumbnailCard image={item.data} />
                      ) : null}
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
