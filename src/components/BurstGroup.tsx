import { useImageStore } from '../stores/imageStore';
import { BurstGroupData } from '../types';
import ThumbnailCard from './ThumbnailCard';
import './BurstGroup.css';

interface BurstGroupProps {
  burstGroup: BurstGroupData;
}

function BurstGroup({ burstGroup }: BurstGroupProps) {
  const { expandedBursts, toggleBurstExpand } = useImageStore();
  const isExpanded = expandedBursts.has(burstGroup.id);

  // Get the top image (first in sequence)
  const topImage = burstGroup.images[0];
  const mockImage = topImage as any;
  const hue = mockImage._mockHue || 0;
  const brightness = mockImage._mockBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBurstExpand(burstGroup.id);
  };

  const getPlaceholderStyle = () => ({
    backgroundColor: `hsl(${hue}, 60%, ${brightness * 100}%)`,
  });

  if (isExpanded) {
    return (
      <div className="burst-group expanded">
        <div className="burst-header">
          <div className="burst-indicator">
            <span>Burst ({burstGroup.images.length})</span>
            <button className="collapse-button" onClick={handleClick}>
              ▼
            </button>
          </div>
        </div>
        <div className="burst-images">
          {burstGroup.images.map((image) => (
            <ThumbnailCard key={image.id} image={image} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="burst-group collapsed" onClick={handleClick}>
      <div className="burst-card">
        <div className="image-stack">
          <div className="stack-layer stack-3"></div>
          <div className="stack-layer stack-2"></div>
          <div className="image-placeholder" style={getPlaceholderStyle()}>
            <div className="camera-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
              </svg>
            </div>
            <div className="burst-count-badge">
              <span>{burstGroup.images.length}</span>
            </div>
          </div>
        </div>

        <div className="image-info">
          <div className="filename">{topImage.filename}</div>
          <div className="burst-info">Burst • {burstGroup.images.length} images</div>
        </div>
      </div>
    </div>
  );
}

export default BurstGroup;