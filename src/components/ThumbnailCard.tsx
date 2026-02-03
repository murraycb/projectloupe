import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './ThumbnailCard.css';

interface ThumbnailCardProps {
  image: ImageEntry;
}

function ThumbnailCard({ image }: ThumbnailCardProps) {
  const { selectedIds, toggleSelection, overlayMode } = useImageStore();
  const isSelected = selectedIds.has(image.id);

  const hue = image._mockHue || 0;
  const brightness = image._mockBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelection(image.id);
  };

  return (
    <div
      className={`thumb-card ${isSelected ? 'selected' : ''} ${image.flag !== 'none' ? image.flag : ''}`}
      onClick={handleClick}
    >
      <div className="thumb-image">
        <div
          className="thumb-placeholder"
          style={{ backgroundColor: `hsl(${hue}, 50%, ${brightness * 60 + 20}%)` }}
        />

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
              {image.exif.shutterSpeed} · f/{image.exif.aperture}
            </span>
          )}
          {overlayMode === 'full' && (
            <span className="thumb-exif-full">
              ISO {image.exif.iso} · {image.exif.focalLength}mm
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ThumbnailCard;
