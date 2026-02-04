/**
 * Full-screen loupe view for detailed image inspection.
 *
 * Renders as a fixed overlay on top of the grid. When opened on a burst,
 * navigation (←→) is locked to that burst's frames, with a filmstrip at the
 * bottom showing all frames and their flag state.
 *
 * Image loading is two-phase: the grid thumbnail (640px) shows immediately
 * (with a subtle blur to signal it's not final), then the full-res embedded
 * JPEG (8K JpgFromRaw) swaps in once extracted. Extraction is on-demand and
 * cached to ~/.projectloupe/cache/loupe/.
 *
 * Keyboard shortcuts (P/X/U, 1-5, 6-9) are handled here independently from
 * the grid's handler — the loupe intercepts keys when active so grid shortcuts
 * don't fire underneath.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './LoupeView.css';

function LoupeView() {
  const {
    loupe,
    images,
    burstGroups,
    closeLoupe,
    loupeNext,
    loupePrev,
    setFlag,
    setRating,
    setColorLabel,
  } = useImageStore();

  const currentImage = useMemo(
    () => images.find((img) => img.id === loupe.imageId) || null,
    [images, loupe.imageId]
  );

  // Get the navigable image list (burst frames or all images)
  const navigableImages = useMemo(() => {
    if (loupe.burstId) {
      const burst = burstGroups.find((b) => b.id === loupe.burstId);
      return burst ? burst.images : [];
    }
    return images;
  }, [loupe.burstId, burstGroups, images]);

  const currentIndex = useMemo(
    () => navigableImages.findIndex((img) => img.id === loupe.imageId),
    [navigableImages, loupe.imageId]
  );

  const burstInfo = useMemo(() => {
    if (!loupe.burstId) return null;
    return burstGroups.find((b) => b.id === loupe.burstId) || null;
  }, [loupe.burstId, burstGroups]);

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
          if (loupe.imageId) setFlag(loupe.imageId, 'pick');
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          if (loupe.imageId) setFlag(loupe.imageId, 'reject');
          break;
        case 'u':
        case 'U':
          e.preventDefault();
          if (loupe.imageId) setFlag(loupe.imageId, 'none');
          break;
        case '1': case '2': case '3': case '4': case '5':
          e.preventDefault();
          if (loupe.imageId) setRating(loupe.imageId, parseInt(e.key));
          break;
        case '0':
          e.preventDefault();
          if (loupe.imageId) setRating(loupe.imageId, 0);
          break;
        case '6':
          e.preventDefault();
          if (loupe.imageId) setColorLabel(loupe.imageId, 'red');
          break;
        case '7':
          e.preventDefault();
          if (loupe.imageId) setColorLabel(loupe.imageId, 'yellow');
          break;
        case '8':
          e.preventDefault();
          if (loupe.imageId) setColorLabel(loupe.imageId, 'green');
          break;
        case '9':
          e.preventDefault();
          if (loupe.imageId) setColorLabel(loupe.imageId, 'blue');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loupe.active, loupe.imageId, closeLoupe, loupeNext, loupePrev, setFlag, setRating, setColorLabel]);

  if (!loupe.active || !currentImage) return null;

  const loupeUrl = loupe.loupeUrls[currentImage.path];
  const thumbnailUrl = currentImage.thumbnailUrl;
  // Show thumbnail first, swap to full-res when ready
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
        {/* Flag indicator */}
        {currentImage.flag === 'pick' && (
          <div className="loupe-flag pick">✓ Pick</div>
        )}
        {currentImage.flag === 'reject' && (
          <div className="loupe-flag reject">✕ Reject</div>
        )}

        {/* Rating */}
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

        {/* Nav arrows */}
        {currentIndex > 0 && (
          <button className="loupe-nav loupe-nav-left" onClick={loupePrev}>‹</button>
        )}
        {currentIndex < navigableImages.length - 1 && (
          <button className="loupe-nav loupe-nav-right" onClick={loupeNext}>›</button>
        )}
      </div>

      {/* Filmstrip (burst mode only, or when navigating all images) */}
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

  // Auto-scroll active thumb into view
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
