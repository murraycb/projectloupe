import { useImageStore } from '../stores/imageStore';
import { ImageEntry } from '../types';
import './ThumbnailCard.css';

interface ThumbnailCardProps {
  image: ImageEntry;
}

function ThumbnailCard({ image }: ThumbnailCardProps) {
  const { selectedIds, toggleSelection } = useImageStore();
  
  const isSelected = selectedIds.has(image.id);
  const mockImage = image as ImageEntry & { _mockHue?: number; _mockBrightness?: number };
  const hue = mockImage._mockHue || 0;
  const brightness = mockImage._mockBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelection(image.id);
  };

  const getPlaceholderStyle = () => ({
    backgroundColor: `hsl(${hue}, 60%, ${brightness * 100}%)`,
  });

  const renderStars = () => {
    if (image.rating === 0) return null;
    
    return (
      <div className="star-rating">
        {Array.from({ length: image.rating }, (_, i) => (
          <span key={i} className="star">★</span>
        ))}
      </div>
    );
  };

  const renderFlag = () => {
    if (image.flag === 'none') return null;
    
    return (
      <div className={`flag-indicator ${image.flag}`}>
        {image.flag === 'pick' && <span className="flag-icon">▲</span>}
        {image.flag === 'reject' && (
          <>
            <span className="flag-icon">✕</span>
            <div className="reject-line"></div>
          </>
        )}
      </div>
    );
  };

  const renderColorLabel = () => {
    if (image.colorLabel === 'none') return null;
    
    return <div className={`color-label ${image.colorLabel}`}></div>;
  };

  return (
    <div 
      className={`thumbnail-card ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <div className="image-placeholder" style={getPlaceholderStyle()}>
        <div className="camera-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
            <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
          </svg>
        </div>
        {renderStars()}
        {renderFlag()}
      </div>
      
      <div className="image-info">
        <div className="filename">{image.filename}</div>
      </div>
      
      {renderColorLabel()}
    </div>
  );
}

export default ThumbnailCard;