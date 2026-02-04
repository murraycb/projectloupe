import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './ThumbnailCard.css';

interface ThumbnailCardProps {
  image: ImageEntry;
  /** When rendered as part of an expanded burst */
  burstId?: string;
  /** 1-based position within the burst */
  frameIndex?: number;
  /** Total frames in the burst */
  frameCount?: number;
}

function ThumbnailCard({ image, burstId, frameIndex, frameCount }: ThumbnailCardProps) {
  const { selectedIds, toggleSelection, overlayMode, openLoupe, toggleBurstExpanded } = useImageStore();
  const isSelected = selectedIds.has(image.id);

  // Placeholder hue/brightness kept for potential future use but not used for swatch
  const _hue = image._placeholderHue || 0;
  const _brightness = image._placeholderBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelection(image.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openLoupe(image.id);
  };

  // Progressive thumbnail priority: preview > micro > legacy > none
  const displayUrl = image.previewThumbnailUrl || image.microThumbnailUrl || image.thumbnailUrl;

  const isBurstFrame = !!burstId;

  return (
    <div
      className={`thumb-card ${isSelected ? 'selected' : ''} ${image.flag !== 'none' ? image.flag : ''} ${isBurstFrame ? 'burst-frame' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="thumb-image">
        {/* Neutral letterbox/pillarbox background */}
        <div className="thumb-swatch" />
        
        {/* Thumbnail overlaid with crossfade */}
        {displayUrl && (
          <img
            className="thumb-img"
            src={displayUrl}
            alt={image.filename}
            loading="lazy"
            draggable={false}
            onLoad={(e) => e.currentTarget.classList.add('loaded')}
          />
        )}

        {/* Flag indicator */}
        {image.flag === 'pick' && <div className="thumb-flag pick" />}
        {image.flag === 'reject' && (
          <>
            <div className="thumb-flag reject" />
            <div className="thumb-reject-line" />
          </>
        )}

        {/* Star rating */}
        {image.rating > 0 && overlayMode !== 'none' && (
          <div className="thumb-stars">
            {'★'.repeat(image.rating)}
          </div>
        )}

        {/* Frame position badge — click to collapse burst */}
        {isBurstFrame && frameIndex != null && frameCount != null && (
          <button
            className="burst-frame-badge interactive"
            onClick={(e) => { e.stopPropagation(); toggleBurstExpanded(burstId); }}
            title="Collapse burst"
          >
            <svg className="burst-stack-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="0" y="4" width="7" height="5" rx="1" opacity="0.4" />
              <rect x="1.5" y="2" width="7" height="5" rx="1" opacity="0.7" />
              <rect x="3" y="0" width="7" height="5" rx="1" opacity="1" />
            </svg>
            <span>{frameIndex}/{frameCount}</span>
          </button>
        )}

        {/* Color label strip */}
        {image.colorLabel !== 'none' && (
          <div className={`thumb-color-strip ${image.colorLabel}`} />
        )}
      </div>

      {/* Overlays based on mode */}
      {overlayMode !== 'none' && (
        <div className="thumb-info">
          <span className="thumb-filename">{image.filename}</span>
          {(overlayMode === 'standard' || overlayMode === 'full') && (
            <span className="thumb-exif-brief">
              {[image.exif.shutterSpeed, image.exif.aperture != null ? `f/${image.exif.aperture}` : null].filter(Boolean).join(' · ') || '—'}
            </span>
          )}
          {overlayMode === 'full' && (
            <span className="thumb-exif-full">
              {[image.exif.iso != null ? `ISO ${image.exif.iso}` : null, image.exif.focalLength != null ? `${image.exif.focalLength}mm` : null].filter(Boolean).join(' · ') || '—'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ThumbnailCard;
