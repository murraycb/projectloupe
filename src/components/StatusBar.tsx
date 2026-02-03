import { useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import './StatusBar.css';

interface StatusBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

function StatusBar({ theme, onToggleTheme }: StatusBarProps) {
  const { images, selectedIds, filters, overlayMode } = useImageStore();

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

  return (
    <div className="status-bar">
      <div className="status-left">
        {images.length > 0 ? (
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
