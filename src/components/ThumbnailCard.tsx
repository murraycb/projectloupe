import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './ThumbnailCard.css';

interface ThumbnailCardProps {
  image: ImageEntry;
}

function ThumbnailCard({ image }: ThumbnailCardProps) {
  const { selectedIds, toggleSelection, overlayMode, openLoupe } = useImageStore();
  const isSelected = selectedIds.has(image.id);

  const hue = image._placeholderHue || 0;
  const brightness = image._placeholderBrightness || 0.5;

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
  const swatchColor = image.colorSwatch || `hsl(${hue}, 50%, ${brightness * 60 + 20}%)`;

  return (
    <div
      className={`thumb-card ${isSelected ? 'selected' : ''} ${image.flag !== 'none' ? image.flag : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="thumb-image">
        {/* Always-visible color swatch background */}
        <div 
          className="thumb-swatch" 
          style={{ backgroundColor: swatchColor }} 
        />
        
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
