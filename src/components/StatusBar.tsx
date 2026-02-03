import { useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import './StatusBar.css';

function StatusBar() {
  const { images, selectedIds, filters } = useImageStore();

  const stats = useMemo(() => {
    const total = images.length;
    const picks = images.filter(i => i.flag === 'pick').length;
    const rejects = images.filter(i => i.flag === 'reject').length;
    const rated = images.filter(i => i.rating > 0).length;
    const bursts = new Set(images.filter(i => i.burstGroupId).map(i => i.burstGroupId)).size;

    const filtered = images.filter(image => {
      if (image.rating < filters.minRating) return false;
      if (filters.flags.size > 0 && !filters.flags.has(image.flag)) return false;
      if (filters.colorLabels.size > 0 && !filters.colorLabels.has(image.colorLabel)) return false;
      if (filters.showBurstsOnly && !image.burstGroupId) return false;
      return true;
    }).length;

    return { total, filtered, picks, rejects, rated, bursts };
  }, [images, filters]);

  const hasImages = images.length > 0;

  return (
    <div className="status-bar">
      <div className="status-left">
        {hasImages ? (
          <>
            <span className="status-item">
              {stats.filtered === stats.total
                ? `${stats.total} images`
                : `${stats.filtered} of ${stats.total} images`}
            </span>
            {stats.bursts > 0 && (
              <span className="status-item dim">
                {stats.bursts} burst{stats.bursts !== 1 ? 's' : ''}
              </span>
            )}
          </>
        ) : (
          <span className="status-item dim">No images loaded</span>
        )}
      </div>

      <div className="status-center">
        {selectedIds.size > 0 && (
          <span className="status-item">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <div className="status-right">
        {hasImages && (
          <>
            {stats.picks > 0 && (
              <span className="status-item pick">
                <span className="status-dot pick"></span>
                {stats.picks} picks
              </span>
            )}
            {stats.rejects > 0 && (
              <span className="status-item reject">
                <span className="status-dot reject"></span>
                {stats.rejects} rejects
              </span>
            )}
            {stats.rated > 0 && (
              <span className="status-item">
                <span className="star-mini">★</span>
                {stats.rated} rated
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
