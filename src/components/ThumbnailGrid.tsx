import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
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
  const { imageMap, imageOrder, normalizedBurstGroups, cameras, filters, thumbnailSize, gridGap, expandedBursts } = useImageStore();

  // Responsive column count — derived from thumbnailSize + gridGap
  // cellWidth = thumbnail + one gap (gap is between cells, not on edges)
  const cellWidth = thumbnailSize + gridGap;
  useEffect(() => {
    const updateColumns = () => {
      if (parentRef.current) {
        const cs = getComputedStyle(parentRef.current);
        const usable = parentRef.current.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        setColumns(Math.max(2, Math.floor((usable + gridGap) / cellWidth)));
      }
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (parentRef.current) observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, [cellWidth, gridGap]);

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

  // Row height: measured from hidden DOM elements, not hardcoded constants.
  // Two hidden cards (single at max overlay + burst) are rendered off-screen.
  // A ResizeObserver tracks their height — the tallest card + row gap = ITEM_HEIGHT.
  // This self-heals when CSS changes, new widgets are added, fonts load, etc.
  const singleMeasureRef = useRef<HTMLDivElement>(null);
  const burstMeasureRef = useRef<HTMLDivElement>(null);
  const headerMeasureRef = useRef<HTMLDivElement>(null);
  const [measuredCellHeight, setMeasuredCellHeight] = useState(thumbnailSize + 62); // fallback before first measure
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(35); // fallback

  const measureCells = useCallback(() => {
    const sH = singleMeasureRef.current?.getBoundingClientRect().height ?? 0;
    const bH = burstMeasureRef.current?.getBoundingClientRect().height ?? 0;
    const hH = headerMeasureRef.current?.getBoundingClientRect().height ?? 0;
    const maxH = Math.max(sH, bH);
    if (maxH > 0) setMeasuredCellHeight(maxH);
    if (hH > 0) setMeasuredHeaderHeight(hH);
  }, []);

  useEffect(() => {
    measureCells();
    const observer = new ResizeObserver(measureCells);
    if (singleMeasureRef.current) observer.observe(singleMeasureRef.current);
    if (burstMeasureRef.current) observer.observe(burstMeasureRef.current);
    if (headerMeasureRef.current) observer.observe(headerMeasureRef.current);
    return () => observer.disconnect();
  }, [thumbnailSize, measureCells]);

  const ITEM_HEIGHT = measuredCellHeight + gridGap;
  const HEADER_HEIGHT = measuredHeaderHeight + gridGap; // gap below header matches grid spacing

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
  }, [displayItems, columns, ITEM_HEIGHT]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => rows[i]?.height ?? ITEM_HEIGHT,
    overscan: 3,
  });

  // Force virtualizer to recalculate row positions when heights change
  // (thumbnail size slider, density slider). Without this, TanStack
  // Virtual caches stale estimateSize results and rows overlap.
  useEffect(() => {
    virtualizer.measure();
  }, [ITEM_HEIGHT, virtualizer]);

  // Empty state
  if (imageMap.size === 0) {
    return (
      <div ref={parentRef} className="thumbnail-grid" style={{ padding: gridGap }}>
        <IngestPanel />
      </div>
    );
  }

  // No results from filters
  if (displayItems.length === 0) {
    return (
      <div ref={parentRef} className="thumbnail-grid" style={{ padding: gridGap }}>
        <div className="empty-state">
          <p className="empty-title">No images match filters</p>
          <p className="empty-hint">Try adjusting or clearing your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="thumbnail-grid" style={{ padding: gridGap }}>
      {/* Hidden measurement cards — derive row height from actual DOM rendering.
          Renders both card types at max content so the grid always reserves enough
          space. Self-heals when CSS changes, new widgets added, fonts load, etc. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          width: thumbnailSize,
          zIndex: -1,
        }}
      >
        {/* Single card at max overlay (full: filename + 2 exif lines) */}
        <div ref={singleMeasureRef} className="thumb-card">
          <div className="thumb-image" />
          <div className="thumb-info">
            <span className="thumb-filename">M</span>
            <span className="thumb-exif-brief">M</span>
            <span className="thumb-exif-full">M</span>
          </div>
        </div>
        {/* Burst card (filename + burst info) */}
        <div ref={burstMeasureRef} className="burst-group collapsed">
          <div className="burst-card">
            <div className="image-stack">
              <div className="image-placeholder" />
            </div>
            <div className="image-info">
              <div className="filename">M</div>
              <div className="burst-info">M</div>
            </div>
          </div>
        </div>
        {/* Camera header */}
        <div ref={headerMeasureRef} className="camera-header">
          <span className="camera-label">MEASURE</span>
          <span className="camera-count">0 images</span>
        </div>
      </div>

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
                <div className="grid-row" style={{ gap: gridGap, paddingBottom: gridGap }}>
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
