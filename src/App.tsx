import { useEffect, useState, useCallback, useRef } from 'react';
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { useImageStore } from './stores/imageStore';
import FilterBar from './components/FilterBar';
import ThumbnailGrid from './components/ThumbnailGrid';
import MetadataPanel from './components/MetadataPanel';
import StatusBar from './components/StatusBar';
import CommandPalette from './components/CommandPalette';
import './App.css';

// Dockview panel wrappers
const GridPanel = (props: IDockviewPanelProps) => <ThumbnailGrid />;
const InfoPanel = (props: IDockviewPanelProps) => <MetadataPanel />;

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const dockviewRef = useRef<any>(null);

  const {
    images,
    setRating,
    setFlag,
    setColorLabel,
    toggleBurstExpand,
    selectedIds,
    expandedBursts,
    overlayMode,
    cycleOverlayMode,
  } = useImageStore();

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // Dockview setup
  const onReady = (event: DockviewReadyEvent) => {
    dockviewRef.current = event.api;

    event.api.addPanel({
      id: 'grid',
      component: 'grid',
      title: 'Grid',
    });

    event.api.addPanel({
      id: 'info',
      component: 'info',
      title: 'Info',
      position: { referencePanel: 'grid', direction: 'right' },
      initialWidth: 280,
    });
  };

  const components = { grid: GridPanel, info: InfoPanel };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Cmd+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        return;
      }

      // Cmd+Shift+T — toggle theme
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 't') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // J — cycle overlay mode
      if (e.key === 'j' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleOverlayMode();
        return;
      }

      // Don't process shortcuts below if command palette is open
      if (showCommandPalette) return;

      const selectedArray = Array.from(selectedIds);
      if (selectedArray.length === 0) return;

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
        case '1': case '2': case '3': case '4': case '5':
          e.preventDefault();
          selectedArray.forEach(id => setRating(id, parseInt(e.key)));
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
  }, [setRating, setFlag, setColorLabel, selectedIds, expandedBursts, toggleBurstExpand, showCommandPalette, toggleTheme, cycleOverlayMode]);

  return (
    <div className="app">
      <FilterBar />
      <div className="main-content">
        {images.length === 0 ? (
          <>
            <ThumbnailGrid />
            <MetadataPanel />
          </>
        ) : (
          <DockviewReact
            className="dockview-theme-custom"
            onReady={onReady}
            components={components}
          />
        )}
      </div>
      <StatusBar theme={theme} onToggleTheme={toggleTheme} />
      {showCommandPalette && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}
    </div>
  );
}

export default App;
