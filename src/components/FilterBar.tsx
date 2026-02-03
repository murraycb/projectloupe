import { useImageStore } from '../stores/imageStore';
import './FilterBar.css';

function FilterBar() {
  const { images, filters, setFilter, clearFilters } = useImageStore();

  const handleStarFilter = (rating: number) => {
    setFilter('minRating', filters.minRating === rating ? 0 : rating);
  };

  const handleFlagFilter = (flag: string) => {
    const newFlags = new Set(filters.flags);
    if (newFlags.has(flag)) {
      newFlags.delete(flag);
    } else {
      newFlags.add(flag);
    }
    setFilter('flags', newFlags);
  };

  const handleColorLabelFilter = (label: string) => {
    const newColorLabels = new Set(filters.colorLabels);
    if (newColorLabels.has(label)) {
      newColorLabels.delete(label);
    } else {
      newColorLabels.add(label);
    }
    setFilter('colorLabels', newColorLabels);
  };

  // Calculate filtered count
  const filteredImages = images.filter(image => {
    if (image.rating < filters.minRating) return false;
    if (filters.flags.size > 0 && !filters.flags.has(image.flag)) return false;
    if (filters.colorLabels.size > 0 && !filters.colorLabels.has(image.colorLabel)) return false;
    if (filters.showBurstsOnly && !image.burstGroupId) return false;
    return true;
  });

  const hasActiveFilters = filters.minRating > 0 || 
    filters.flags.size > 0 || 
    filters.colorLabels.size > 0 || 
    filters.showBurstsOnly;

  const hasImages = images.length > 0;

  return (
    <div className={`filter-bar ${!hasImages ? 'disabled' : ''}`}>
      <div className="filter-section">
        <label>Rating:</label>
        <div className="star-filters">
          {[1, 2, 3, 4, 5].map(rating => (
            <button
              key={rating}
              className={`star-button ${filters.minRating === rating ? 'active' : ''}`}
              onClick={() => handleStarFilter(rating)}
              title={`${rating}+ stars`}
            >
              <span className="star">★</span>
              <span>{rating}+</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <label>Flags:</label>
        <div className="flag-filters">
          <button
            className={`flag-button pick ${filters.flags.has('pick') ? 'active' : ''}`}
            onClick={() => handleFlagFilter('pick')}
            title="Pick"
          >
            <span className="flag-icon pick-icon">▲</span>
          </button>
          <button
            className={`flag-button reject ${filters.flags.has('reject') ? 'active' : ''}`}
            onClick={() => handleFlagFilter('reject')}
            title="Reject"
          >
            <span className="flag-icon reject-icon">✕</span>
          </button>
          <button
            className={`flag-button unflagged ${filters.flags.has('none') ? 'active' : ''}`}
            onClick={() => handleFlagFilter('none')}
            title="Unflagged"
          >
            <span className="flag-icon unflagged-icon">○</span>
          </button>
        </div>
      </div>

      <div className="filter-section">
        <label>Colors:</label>
        <div className="color-filters">
          {['red', 'yellow', 'green', 'blue', 'purple'].map(color => (
            <button
              key={color}
              className={`color-button ${color} ${filters.colorLabels.has(color) ? 'active' : ''}`}
              onClick={() => handleColorLabelFilter(color)}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            >
              <span className="color-dot"></span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <button
          className={`burst-filter ${filters.showBurstsOnly ? 'active' : ''}`}
          onClick={() => setFilter('showBurstsOnly', !filters.showBurstsOnly)}
          title="Show bursts only"
        >
          Bursts only
        </button>
      </div>

      <div className="filter-info">
        <span className="image-count">
          Showing {filteredImages.length} of {images.length} images
        </span>
        {hasActiveFilters && (
          <button className="clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

export default FilterBar;