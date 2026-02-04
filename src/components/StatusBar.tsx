import { useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import './StatusBar.css';

interface StatusBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

function StatusBar({ theme, onToggleTheme }: StatusBarProps) {
  const { imageMap, normalizedBurstGroups, selectedIds, filters, overlayMode } = useImageStore();

  const stats = useMemo(() => {
    const total = imageMap.size;
    let picks = 0, rejects = 0, rated = 0, filtered = 0;

    for (const [, img] of imageMap) {
      if (img.flag === 'pick') picks++;
      if (img.flag === 'reject') rejects++;
      if (img.rating > 0) rated++;

      // Check if passes current filters
      if (img.rating >= filters.minRating &&
          (filters.flags.size === 0 || filters.flags.has(img.flag)) &&
          (filters.colorLabels.size === 0 || filters.colorLabels.has(img.colorLabel)) &&
          (!filters.showBurstsOnly || img.burstGroupId)) {
        filtered++;
      }
    }

    const bursts = normalizedBurstGroups.length;
    return { total, filtered, picks, rejects, rated, bursts };
  }, [imageMap, normalizedBurstGroups, filters]);

  return (
    <div className="status-bar">
      <div className="status-left">
        {imageMap.size > 0 ? (
          <>
            <span className="status-item">
              {stats.filtered === stats.total
                ? `${stats.total} images`
                : `${stats.filtered} of ${stats.total}`}
            </span>
            {stats.bursts > 0 && (
              <span className="status-item dim">{stats.bursts} bursts</span>
            )}
          </>
        ) : (
          <span className="status-item dim">No images loaded</span>
        )}
      </div>

      <div className="status-center">
        {selectedIds.size > 0 && (
          <span className="status-item">{selectedIds.size} selected</span>
        )}
      </div>

      <div className="status-right">
        <span className="status-item dim">
          Overlay: {overlayMode} (J)
        </span>
        {stats.picks > 0 && (
          <span className="status-item pick">
            {stats.picks} picks
          </span>
        )}
        {stats.rejects > 0 && (
          <span className="status-item reject">
            {stats.rejects} rejects
          </span>
        )}
        <button className="status-theme-btn" onClick={onToggleTheme} title="Toggle theme (⌘⇧T)">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
}

export default StatusBar;
