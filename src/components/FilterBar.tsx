import { useImageStore } from '../stores/imageStore';
import './FilterBar.css';

function FilterBar() {
  const { imageMap, filters, setFilter, clearFilters } = useImageStore();

  const handleStarFilter = (rating: number) => {
    setFilter('minRating', filters.minRating === rating ? 0 : rating);
  };

  const handleFlagFilter = (flag: string) => {
    const newFlags = new Set(filters.flags);
    if (newFlags.has(flag)) newFlags.delete(flag);
    else newFlags.add(flag);
    setFilter('flags', newFlags);
  };

  const handleColorLabelFilter = (label: string) => {
    const newColorLabels = new Set(filters.colorLabels);
    if (newColorLabels.has(label)) newColorLabels.delete(label);
    else newColorLabels.add(label);
    setFilter('colorLabels', newColorLabels);
  };

  let filteredCount = 0;
  for (const [, image] of imageMap) {
    if (image.rating >= filters.minRating &&
        (filters.flags.size === 0 || filters.flags.has(image.flag)) &&
        (filters.colorLabels.size === 0 || filters.colorLabels.has(image.colorLabel)) &&
        (!filters.showBurstsOnly || image.burstGroupId)) {
      filteredCount++;
    }
  }

  const hasActiveFilters = filters.minRating > 0 || filters.flags.size > 0 || filters.colorLabels.size > 0 || filters.showBurstsOnly;
  const totalCount = imageMap.size;
  const hasImages = totalCount > 0;

  return (
    <div className={`filter-bar ${!hasImages ? 'disabled' : ''}`}>
      <div className="filter-group">
        <span className="filter-label">Rating</span>
        <div className="filter-buttons">
          {[1, 2, 3, 4, 5].map(rating => (
            <button
              key={rating}
              className={`filter-btn star-btn ${filters.minRating === rating ? 'active' : ''}`}
              onClick={() => handleStarFilter(rating)}
            >
              {'★'.repeat(rating)}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-separator" />

      <div className="filter-group">
        <span className="filter-label">Flag</span>
        <div className="filter-buttons">
          <button
            className={`filter-btn flag-btn ${filters.flags.has('pick') ? 'active pick' : ''}`}
            onClick={() => handleFlagFilter('pick')}
          >Pick</button>
          <button
            className={`filter-btn flag-btn ${filters.flags.has('reject') ? 'active reject' : ''}`}
            onClick={() => handleFlagFilter('reject')}
          >Reject</button>
          <button
            className={`filter-btn flag-btn ${filters.flags.has('none') ? 'active' : ''}`}
            onClick={() => handleFlagFilter('none')}
          >Unflagged</button>
        </div>
      </div>

      <div className="filter-separator" />

      <div className="filter-group">
        <span className="filter-label">Label</span>
        <div className="filter-buttons">
          {(['red', 'yellow', 'green', 'blue', 'purple'] as const).map(color => (
            <button
              key={color}
              className={`filter-btn color-btn ${color} ${filters.colorLabels.has(color) ? 'active' : ''}`}
              onClick={() => handleColorLabelFilter(color)}
              title={color}
            >
              <span className="color-dot" />
            </button>
          ))}
        </div>
      </div>

      <div className="filter-separator" />

      <button
        className={`filter-btn ${filters.showBurstsOnly ? 'active' : ''}`}
        onClick={() => setFilter('showBurstsOnly', !filters.showBurstsOnly)}
      >Bursts</button>

      <div className="filter-spacer" />

      <span className="filter-count">
        {hasImages ? (
          filteredCount === totalCount
            ? `${totalCount} images`
            : `${filteredCount} of ${totalCount}`
        ) : (
          'No images'
        )}
      </span>

      {hasActiveFilters && (
        <button className="filter-btn clear-btn" onClick={clearFilters}>Clear</button>
      )}
    </div>
  );
}

export default FilterBar;
