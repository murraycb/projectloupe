/**
 * Burst stack card in the thumbnail grid.
 *
 * Uses selector hooks to derive cover image, flag state, etc. from the
 * normalized imageMap — no more embedded image copies.
 */
import { useImageStore } from '../stores/imageStore';
import { useBurstCover, useBurstAllRejected, useBurstHasPicks, useBurstGroup } from '../stores/selectors';
import './BurstGroup.css';

interface BurstGroupProps {
  burstId: string;
}

function BurstGroup({ burstId }: BurstGroupProps) {
  const { openLoupe, selectedIds, expandedBursts, toggleBurstExpanded } = useImageStore();
  const burst = useBurstGroup(burstId);
  const coverImage = useBurstCover(burstId);
  const allRejected = useBurstAllRejected(burstId);
  const hasPicks = useBurstHasPicks(burstId);

  if (!burst || !coverImage) return null;

  const isSelected = burst.imageIds.some((id) => selectedIds.has(id));
  const isExpanded = expandedBursts.has(burstId);

  const hue = coverImage._placeholderHue || 0;
  const brightness = coverImage._placeholderBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openLoupe(coverImage.id);
  };

  const fpsLabel = burst.estimatedFps > 0
    ? `${burst.estimatedFps.toFixed(1)} fps`
    : '';

  return (
    <div
      className={`burst-group collapsed ${isSelected ? 'selected' : ''} ${allRejected ? 'all-rejected' : ''}`}
      onClick={handleClick}
    >
      <div className="burst-card">
        <div className="image-stack">
          <div className="stack-layer stack-3"></div>
          <div className="stack-layer stack-2"></div>
          <div className="image-placeholder">
            <div className="burst-swatch" style={{ backgroundColor: coverImage.colorSwatch || `hsl(${hue}, 60%, ${brightness * 100}%)` }} />
            {coverImage.thumbnailUrl && (
              <img
                className="burst-cover-img"
                src={coverImage.thumbnailUrl}
                alt={coverImage.filename}
                draggable={false}
                onLoad={(e) => e.currentTarget.classList.add('loaded')}
              />
            )}
            {!coverImage.thumbnailUrl && (
              <div className="camera-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                  <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                </svg>
              </div>
            )}
            {allRejected && <div className="burst-flag-reject" />}
            {!allRejected && hasPicks && <div className="burst-flag-pick" />}
            <div className="burst-count-badge">
              <span>{burst.frameCount}</span>
            </div>
            <button
              className={`burst-expand-btn ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleBurstExpanded(burstId); }}
              title={isExpanded ? 'Collapse burst' : 'Expand burst'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d={isExpanded ? 'M7 14l5-5 5 5z' : 'M7 10l5 5 5-5z'} />
              </svg>
            </button>
          </div>
        </div>

        <div className="image-info">
          <div className="filename">{coverImage.filename || 'Burst'}</div>
          <div className="burst-info">
            Burst · {burst.frameCount} frames
            {fpsLabel && ` · ${fpsLabel}`}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BurstGroup;
