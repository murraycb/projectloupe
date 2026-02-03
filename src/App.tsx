import { useEffect } from 'react';
import { useImageStore } from './stores/imageStore';
import FilterBar from './components/FilterBar';
import ThumbnailGrid from './components/ThumbnailGrid';
import MetadataPanel from './components/MetadataPanel';
import StatusBar from './components/StatusBar';
import './App.css';

function App() {
  const {
    images,
    setRating,
    setFlag,
    setColorLabel,
    toggleBurstExpand,
    selectedIds,
    expandedBursts,
  } = useImageStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const selectedArray = Array.from(selectedIds);
      if (selectedArray.length === 0 && images.length > 0) return;

      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          selectedArray.forEach(id => setFlag(id, 'pick'));
          break;
        case 'x':
          e.preventDefault();
          selectedArray.forEach(id => setFlag(id, 'reject'));
          break;
        case 'u':
          e.preventDefault();
          selectedArray.forEach(id => setFlag(id, 'none'));
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          e.preventDefault();
          const rating = parseInt(e.key);
          selectedArray.forEach(id => setRating(id, rating));
          break;
        case '6':
          e.preventDefault();
          selectedArray.forEach(id => setColorLabel(id, 'red'));
          break;
        case '7':
          e.preventDefault();
          selectedArray.forEach(id => setColorLabel(id, 'yellow'));
          break;
        case '8':
          e.preventDefault();
          selectedArray.forEach(id => setColorLabel(id, 'green'));
          break;
        case '9':
          e.preventDefault();
          selectedArray.forEach(id => setColorLabel(id, 'blue'));
          break;
        case 'escape':
          e.preventDefault();
          expandedBursts.forEach(burstId => toggleBurstExpand(burstId));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setRating, setFlag, setColorLabel, selectedIds, expandedBursts, toggleBurstExpand, images]);

  const hasImages = images.length > 0;

  return (
    <div className="app">
      <FilterBar />
      <div className="main-content">
        <ThumbnailGrid />
        <MetadataPanel />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
