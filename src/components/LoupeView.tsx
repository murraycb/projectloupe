/**
 * Full-screen loupe view for detailed image inspection.
 *
 * Uses normalized imageMap for O(1) lookups. Burst navigation uses
 * normalizedBurstGroups[].imageIds for frame ordering.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './LoupeView.css';

function LoupeView() {
  const {
    loupe,
    imageMap,
    imageOrder,
    normalizedBurstGroups,
    filters,
    closeLoupe,
    loupeNext,
    loupePrev,
    setFlag,
    setRating,
    setColorLabel,
  } = useImageStore();

  const currentImage = useMemo(
    () => (loupe.imageId ? imageMap.get(loupe.imageId) ?? null : null),
    [imageMap, loupe.imageId]
  );

  // Get the navigable image list, respecting filters and burst scope
  const navigableImages = useMemo(() => {
    // If scoped to a burst, navigate within burst frames
    if (loupe.burstId) {
      const burst = normalizedBurstGroups.find((b) => b.id === loupe.burstId);
      return burst
        ? burst.imageIds.map((id) => imageMap.get(id)!).filter(Boolean)
        : [];
    }

    // Otherwise, navigate through filtered images only
    const filterImage = (img: ImageEntry) => {
      if (img.rating < filters.minRating) return false;
      if (filters.flags.size > 0 && !filters.flags.has(img.flag)) return false;
      if (filters.colorLabels.size > 0 && !filters.colorLabels.has(img.colorLabel)) return false;
      if (filters.showBurstsOnly && !img.burstGroupId) return false;
      if (filters.cameraSerial && img.serialNumber !== filters.cameraSerial) return false;
      return true;
    };

    return imageOrder
      .map((id) => imageMap.get(id)!)
      .filter((img) => img && filterImage(img));
  }, [loupe.burstId, normalizedBurstGroups, imageMap, imageOrder, filters]);

  const currentIndex = useMemo(
    () => navigableImages.findIndex((img) => img.id === loupe.imageId),
    [navigableImages, loupe.imageId]
  );

  const burstInfo = useMemo(() => {
    if (!loupe.burstId) return null;
    return normalizedBurstGroups.find((b) => b.id === loupe.burstId) || null;
  }, [loupe.burstId, normalizedBurstGroups]);

  // Flag counts for filmstrip summary
  const flagCounts = useMemo(() => {
    const counts = { pick: 0, reject: 0, unflagged: 0 };
    for (const img of navigableImages) {
      if (img.flag === 'pick') counts.pick++;
      else if (img.flag === 'reject') counts.reject++;
      else counts.unflagged++;
    }
    return counts;
  }, [navigableImages]);

  // In review mode (non-burst loupe), auto-advance when a flag change
  // removes the current image from the filtered set.
  const isLoupeReviewMode = !loupe.burstId;

  const advanceLoupeIfFiltered = useCallback(() => {
    if (!isLoupeReviewMode || !loupe.imageId) return;
    setTimeout(() => {
      const state = useImageStore.getState();
      const img = state.imageMap.get(loupe.imageId!);
      if (!img) return;

      // Check if image still passes filters
      const f = state.filters;
      const passes =
        img.rating >= f.minRating &&
        (f.flags.size === 0 || f.flags.has(img.flag)) &&
        (f.colorLabels.size === 0 || f.colorLabels.has(img.colorLabel)) &&
        (!f.showBurstsOnly || !!img.burstGroupId) &&
        (!f.cameraSerial || img.serialNumber === f.cameraSerial);

      if (passes) return; // Still visible, nothing to do

      // Find next navigable image
      const currentIdx = navigableImages.findIndex((i) => i.id === loupe.imageId);
      // Look forward then backward (using pre-mutation list since state just changed)
      let nextImg = navigableImages[currentIdx + 1] || navigableImages[currentIdx - 1];

      if (nextImg) {
        useImageStore.setState((s) => ({
          loupe: { ...s.loupe, imageId: nextImg.id },
          selectedIds: new Set([nextImg.id]),
        }));
      } else {
        // No more images in filtered set — close loupe
        closeLoupe();
      }
    }, 0);
  }, [isLoupeReviewMode, loupe.imageId, navigableImages, closeLoupe]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loupe.active) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          closeLoupe();
          break;
        case 'ArrowRight':
          e.preventDefault();
          loupeNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          loupePrev();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          if (loupe.imageId) { setFlag(loupe.imageId, 'pick'); advanceLoupeIfFiltered(); }
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          if (loupe.imageId) { setFlag(loupe.imageId, 'reject'); advanceLoupeIfFiltered(); }
          break;
        case 'u':
        case 'U':
          e.preventDefault();
          if (loupe.imageId) { setFlag(loupe.imageId, 'none'); advanceLoupeIfFiltered(); }
          break;
        case '1': case '2': case '3': case '4': case '5':
          e.preventDefault();
          if (loupe.imageId) { setRating(loupe.imageId, parseInt(e.key)); advanceLoupeIfFiltered(); }
          break;
        case '0':
          e.preventDefault();
          if (loupe.imageId) { setRating(loupe.imageId, 0); advanceLoupeIfFiltered(); }
          break;
        case '6':
          e.preventDefault();
          if (loupe.imageId) { setColorLabel(loupe.imageId, 'red'); advanceLoupeIfFiltered(); }
          break;
        case '7':
          e.preventDefault();
          if (loupe.imageId) { setColorLabel(loupe.imageId, 'yellow'); advanceLoupeIfFiltered(); }
          break;
        case '8':
          e.preventDefault();
          if (loupe.imageId) { setColorLabel(loupe.imageId, 'green'); advanceLoupeIfFiltered(); }
          break;
        case '9':
          e.preventDefault();
          if (loupe.imageId) { setColorLabel(loupe.imageId, 'blue'); advanceLoupeIfFiltered(); }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loupe.active, loupe.imageId, closeLoupe, loupeNext, loupePrev, setFlag, setRating, setColorLabel, advanceLoupeIfFiltered]);

  if (!loupe.active || !currentImage) return null;

  const loupeUrl = loupe.loupeUrls[currentImage.path];
  const thumbnailUrl = currentImage.thumbnailUrl;
  const displayUrl = loupeUrl || thumbnailUrl;

  const exifParts = [
    currentImage.exif.shutterSpeed,
    currentImage.exif.aperture != null ? `f/${currentImage.exif.aperture}` : null,
    currentImage.exif.iso != null ? `ISO ${currentImage.exif.iso}` : null,
    currentImage.exif.focalLength != null ? `${currentImage.exif.focalLength}mm` : null,
  ].filter(Boolean);

  return (
    <div className="loupe-overlay">
      {/* Top bar */}
      <div className="loupe-topbar">
        <div className="loupe-topbar-left">
          <span className="loupe-title">{currentImage.filename}</span>
          {burstInfo && (
            <span className="loupe-subtitle">
              Frame {currentIndex + 1} of {navigableImages.length} · Burst · {burstInfo.estimatedFps.toFixed(1)} fps
              {burstInfo.durationMs > 0 && ` · ${(burstInfo.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {!burstInfo && (
            <span className="loupe-subtitle">
              {currentIndex + 1} of {navigableImages.length}
            </span>
          )}
        </div>
        <div className="loupe-topbar-right">
          <div className="loupe-exif">
            {exifParts.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
          <button className="loupe-close-btn" onClick={closeLoupe}>
            ESC
          </button>
        </div>
      </div>

      {/* Main image */}
      <div className="loupe-main">
        {currentImage.flag === 'pick' && (
          <div className="loupe-flag pick">✓ Pick</div>
        )}
        {currentImage.flag === 'reject' && (
          <div className="loupe-flag reject">✕ Reject</div>
        )}

        {currentImage.rating > 0 && (
          <div className="loupe-rating">
            {'★'.repeat(currentImage.rating)}
          </div>
        )}

        {displayUrl ? (
          <img
            className={`loupe-image ${!loupeUrl ? 'loupe-image-loading' : ''}`}
            src={displayUrl}
            alt={currentImage.filename}
            draggable={false}
          />
        ) : (
          <div className="loupe-placeholder">
            <div className="loupe-placeholder-text">Loading…</div>
          </div>
        )}

        {currentIndex > 0 && (
          <button className="loupe-nav loupe-nav-left" onClick={loupePrev}>‹</button>
        )}
        {currentIndex < navigableImages.length - 1 && (
          <button className="loupe-nav loupe-nav-right" onClick={loupeNext}>›</button>
        )}
      </div>

      {/* Filmstrip */}
      {navigableImages.length > 1 && (
        <div className="loupe-filmstrip">
          <div className="filmstrip-scroll">
            {navigableImages.map((img, i) => (
              <FilmstripThumb
                key={img.id}
                image={img}
                index={i}
                isActive={img.id === loupe.imageId}
                onClick={() => {
                  useImageStore.setState((state) => ({
                    loupe: { ...state.loupe, imageId: img.id },
                    selectedIds: new Set([img.id]),
                  }));
                }}
              />
            ))}
          </div>
          <div className="filmstrip-summary">
            {flagCounts.pick > 0 && <span className="summary-pick">{flagCounts.pick} pick{flagCounts.pick > 1 ? 's' : ''}</span>}
            {flagCounts.reject > 0 && <span className="summary-reject">{flagCounts.reject} reject{flagCounts.reject > 1 ? 's' : ''}</span>}
            {flagCounts.unflagged > 0 && <span className="summary-unflagged">{flagCounts.unflagged} unflagged</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FilmstripThumb({
  image,
  index,
  isActive,
  onClick,
}: {
  image: ImageEntry;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const flagClass = image.flag === 'pick' ? 'flagged-pick' : image.flag === 'reject' ? 'flagged-reject' : '';
  const hue = image._placeholderHue || 0;
  const brightness = image._placeholderBrightness || 0.5;

  useEffect(() => {
    if (isActive && thumbRef.current) {
      thumbRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [isActive]);

  return (
    <div
      ref={thumbRef}
      className={`filmstrip-thumb ${isActive ? 'active' : ''} ${flagClass}`}
      onClick={onClick}
    >
      {image.thumbnailUrl ? (
        <img src={image.thumbnailUrl} alt={image.filename} draggable={false} />
      ) : (
        <div
          className="filmstrip-placeholder"
          style={{ backgroundColor: `hsl(${hue}, 50%, ${brightness * 60 + 20}%)` }}
        />
      )}
      {image.flag === 'pick' && <div className="filmstrip-flag-pick" />}
      {image.flag === 'reject' && <div className="filmstrip-flag-reject" />}
      <span className="filmstrip-counter">{index + 1}</span>
    </div>
  );
}

export default LoupeView;
