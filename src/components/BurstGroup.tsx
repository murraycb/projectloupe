/**
 * Burst stack card in the thumbnail grid.
 *
 * Renders a stacked card representing a burst sequence. Click opens the loupe
 * view locked to this burst's frames.
 *
 * Visual states:
 * - Cover image: first pick > first unflagged > first frame (smart cover)
 * - All rejected: entire card dims to 35% opacity + red flag triangle
 * - Has picks: green flag triangle on the stack
 * - Selected: blue outline (matches ThumbnailCard selection style)
 *
 * Flag state is read from burstGroup.images[] which is kept in sync with the
 * main images[] array via updateImageProp() in the store.
 */
import { useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import { BurstGroupData } from '../types';
import './BurstGroup.css';

interface BurstGroupProps {
  burstGroup: BurstGroupData;
}

function BurstGroup({ burstGroup }: BurstGroupProps) {
  const { openLoupe, selectedIds } = useImageStore();

  const isSelected = burstGroup.images.some((img) => selectedIds.has(img.id));

  // Determine cover image: first pick, else first unflagged, else first image
  const coverImage = useMemo(() => {
    const firstPick = burstGroup.images.find((img) => img.flag === 'pick');
    if (firstPick) return firstPick;
    const firstUnflagged = burstGroup.images.find((img) => img.flag === 'none');
    if (firstUnflagged) return firstUnflagged;
    return burstGroup.images[0];
  }, [burstGroup.images]);

  // All rejected = dimmed
  const allRejected = burstGroup.images.every((img) => img.flag === 'reject');
  // Has any picks
  const hasPicks = burstGroup.images.some((img) => img.flag === 'pick');

  const hue = coverImage?._placeholderHue || 0;
  const brightness = coverImage?._placeholderBrightness || 0.5;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (coverImage) openLoupe(coverImage.id);
  };

  const fpsLabel = burstGroup.estimatedFps > 0
    ? `${burstGroup.estimatedFps.toFixed(1)} fps`
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
          <div className="image-placeholder" style={
            coverImage?.thumbnailUrl
              ? { backgroundImage: `url(${coverImage.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { backgroundColor: `hsl(${hue}, 60%, ${brightness * 100}%)` }
          }>
            {!coverImage?.thumbnailUrl && (
              <div className="camera-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                  <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                </svg>
              </div>
            )}
            {allRejected && <div className="burst-flag-reject" />}
            {!allRejected && hasPicks && <div className="burst-flag-pick" />}
            <div className="burst-count-badge">
              <span>{burstGroup.frameCount}</span>
            </div>
          </div>
        </div>

        <div className="image-info">
          <div className="filename">{coverImage?.filename || 'Burst'}</div>
          <div className="burst-info">
            Burst · {burstGroup.frameCount} frames
            {fpsLabel && ` · ${fpsLabel}`}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BurstGroup;
