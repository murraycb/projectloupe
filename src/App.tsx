import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import { useImageStore } from './stores/imageStore';
import FilterBar from './components/FilterBar';
import ThumbnailGrid from './components/ThumbnailGrid';
import MetadataPanel from './components/MetadataPanel';
import StatusBar from './components/StatusBar';
import CommandPalette from './components/CommandPalette';
import LoupeView from './components/LoupeView';
import './App.css';

const GridPanel = (_props: IDockviewPanelProps) => <ThumbnailGrid />;
const InfoPanel = (_props: IDockviewPanelProps) => <MetadataPanel />;

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const dockviewRef = useRef<any>(null);

  const {
    imageMap,
    imageOrder,
    normalizedBurstGroups,
    burstIndex,
    cameras,
    setRating,
    setFlag,
    setColorLabel,
    selectedIds,
    clearSelection,
    cycleOverlayMode,
    loupe,
    openLoupe,
  } = useImageStore();

  // Build navigable item list — bursts as single nav items.
  // Only depends on imageOrder + burstIndex (not on flag state),
  // so this doesn't recompute when flags change.
  const { navItems, navRows } = useMemo(() => {
    const items: string[] = [];
    const rows: string[][] = [];
    const byCamera = new Map<string, string[]>();
    const processedBursts = new Set<string>();

    for (const id of imageOrder) {
      const img = imageMap.get(id);
      if (!img) continue;
      const serial = img.serialNumber;
      if (!byCamera.has(serial)) byCamera.set(serial, []);
      const list = byCamera.get(serial)!;

      const burstId = burstIndex.get(id);
      if (burstId) {
        if (!processedBursts.has(burstId)) {
          processedBursts.add(burstId);
          const burst = normalizedBurstGroups.find((b) => b.id === burstId);
          if (burst && burst.imageIds.length > 0) {
            list.push(burst.imageIds[0]);
          }
        }
      } else {
        list.push(id);
      }
    }

    // Column count from grid element
    const gridEl = document.querySelector('.thumbnail-grid');
    const cols = gridEl ? Math.max(2, Math.floor(gridEl.clientWidth / 216)) : 5;

    for (const [, sectionItems] of byCamera) {
      let currentRow: string[] = [];
      for (const id of sectionItems) {
        items.push(id);
        currentRow.push(id);
        if (currentRow.length >= cols) {
          rows.push(currentRow);
          currentRow = [];
        }
      }
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
    }

    return { navItems: items, navRows: rows };
  }, [imageOrder, burstIndex, normalizedBurstGroups, imageMap, cameras]);

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

  // Grid keyboard shortcuts.
  // Loupe has its own handler — bail early when loupe is active.
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

      if (loupe.active) return;

      // J — cycle overlay mode
      if (e.key === 'j' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleOverlayMode();
        return;
      }

      if (showCommandPalette) return;

      const selectedArray = Array.from(selectedIds);

      // ESC — deselect all
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Arrow keys — navigate through grid items
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && navItems.length > 0) {
        e.preventDefault();
        const currentId = selectedArray.length === 1 ? selectedArray[0] : null;
        let currentIdx = currentId ? navItems.indexOf(currentId) : -1;
        if (currentIdx === -1 && currentId) {
          // If selected image is inside a burst, find the burst's first image
          const bId = burstIndex.get(currentId);
          if (bId) {
            const burst = normalizedBurstGroups.find((b) => b.id === bId);
            if (burst && burst.imageIds.length > 0) {
              currentIdx = navItems.indexOf(burst.imageIds[0]);
            }
          }
        }
        if (currentIdx === -1) currentIdx = 0;

        let nextId: string;
        if (e.key === 'ArrowRight') {
          nextId = navItems[Math.min(currentIdx + 1, navItems.length - 1)];
        } else if (e.key === 'ArrowLeft') {
          nextId = navItems[Math.max(currentIdx - 1, 0)];
        } else {
          let rowIdx = -1, colIdx = -1;
          for (let r = 0; r < navRows.length; r++) {
            const c = navRows[r].indexOf(navItems[currentIdx]);
            if (c !== -1) { rowIdx = r; colIdx = c; break; }
          }

          if (rowIdx === -1) {
            nextId = navItems[currentIdx];
          } else if (e.key === 'ArrowDown') {
            const targetRow = Math.min(rowIdx + 1, navRows.length - 1);
            const targetCol = Math.min(colIdx, navRows[targetRow].length - 1);
            nextId = navRows[targetRow][targetCol];
          } else {
            const targetRow = Math.max(rowIdx - 1, 0);
            const targetCol = Math.min(colIdx, navRows[targetRow].length - 1);
            nextId = navRows[targetRow][targetCol];
          }
        }

        useImageStore.setState({ selectedIds: new Set([nextId]) });
        return;
      }

      // Enter — open loupe
      if (e.key === 'Enter' && selectedArray.length === 1) {
        e.preventDefault();
        openLoupe(selectedArray[0]);
        return;
      }

      if (selectedArray.length === 0) return;

      // Burst-aware flagging helper
      const getBurstIds = (id: string): string[] | null => {
        const bId = burstIndex.get(id);
        if (!bId) return null;
        const burst = normalizedBurstGroups.find((b) => b.id === bId);
        return burst ? burst.imageIds : null;
      };

      const applyFlag = (flag: 'pick' | 'reject') => {
        for (const id of selectedArray) {
          const burstIds = getBurstIds(id);
          if (burstIds) {
            const allSame = burstIds.every((bid) => imageMap.get(bid)?.flag === flag);
            const targetFlag = allSame ? 'none' : flag;
            burstIds.forEach((bid) => setFlag(bid, targetFlag));
          } else {
            setFlag(id, flag);
          }
        }
      };

      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          applyFlag('pick');
          break;
        case 'x':
          e.preventDefault();
          applyFlag('reject');
          break;
        case 'u':
          e.preventDefault();
          selectedArray.forEach(id => {
            const burstIds = getBurstIds(id);
            if (burstIds) {
              burstIds.forEach((bid) => setFlag(bid, 'none'));
            } else {
              setFlag(id, 'none');
            }
          });
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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setRating, setFlag, setColorLabel, selectedIds, showCommandPalette, toggleTheme, cycleOverlayMode, loupe.active, openLoupe, clearSelection, navItems, navRows, imageMap, burstIndex, normalizedBurstGroups]);

  return (
    <div className="app">
      <FilterBar />
      <div className="main-content">
        {imageMap.size === 0 ? (
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
      <LoupeView />
    </div>
  );
}

export default App;
