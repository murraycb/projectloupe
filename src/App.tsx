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

// Dockview panel wrappers
const GridPanel = (_props: IDockviewPanelProps) => <ThumbnailGrid />;
const InfoPanel = (_props: IDockviewPanelProps) => <MetadataPanel />;

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const dockviewRef = useRef<any>(null);

  const {
    images,
    burstGroups,
    setRating,
    setFlag,
    setColorLabel,
    toggleBurstExpand,
    selectedIds,
    expandedBursts,
    clearSelection,
    cycleOverlayMode,
    loupe,
    openLoupe,
  } = useImageStore();

  // Build navigable item list grouped by camera section
  // Each camera section starts a new row, so up/down needs to account for this
  const { navItems, navRows } = useMemo(() => {
    const items: string[] = [];
    const rows: string[][] = []; // rows of image IDs as laid out visually

    // Group images by camera serial (in order they appear)
    const byCamera = new Map<string, string[]>();
    const processedBursts = new Set<string>();

    for (const img of images) {
      const serial = img.serialNumber;
      if (!byCamera.has(serial)) byCamera.set(serial, []);
      const list = byCamera.get(serial)!;

      if (img.burstGroupId) {
        if (!processedBursts.has(img.burstGroupId)) {
          processedBursts.add(img.burstGroupId);
          const burst = burstGroups.find((b) => b.id === img.burstGroupId);
          if (burst && burst.images.length > 0) {
            list.push(burst.images[0].id);
          }
        }
      } else {
        list.push(img.id);
      }
    }

    // Estimate column count
    const gridEl = document.querySelector('.thumbnail-grid');
    const cols = gridEl ? Math.max(2, Math.floor(gridEl.clientWidth / 216)) : 5;

    // Build rows per camera section
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
  }, [images, burstGroups]);

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
  // Grid-level keyboard shortcuts.
  // Loupe has its own handler (LoupeView.tsx) — when loupe is active, grid shortcuts
  // bail early to avoid conflicts. This layered approach means the same keys (P/X/U)
  // work in both contexts with different scope (see interaction-patterns.md).
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

      // Don't process grid shortcuts when loupe is active (it handles its own)
      if (loupe.active) return;

      // J — cycle overlay mode
      if (e.key === 'j' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        cycleOverlayMode();
        return;
      }

      // Don't process shortcuts below if command palette is open
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
          const img = images.find((i) => i.id === currentId);
          if (img?.burstGroupId) {
            const burst = burstGroups.find((b) => b.id === img.burstGroupId);
            if (burst && burst.images.length > 0) {
              currentIdx = navItems.indexOf(burst.images[0].id);
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
          // Up/Down — find current row/col and jump to same col in adjacent row
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
            // ArrowUp
            const targetRow = Math.max(rowIdx - 1, 0);
            const targetCol = Math.min(colIdx, navRows[targetRow].length - 1);
            nextId = navRows[targetRow][targetCol];
          }
        }

        useImageStore.setState({ selectedIds: new Set([nextId]) });
        return;
      }

      // Enter — open loupe for selected image
      if (e.key === 'Enter' && selectedArray.length === 1) {
        e.preventDefault();
        openLoupe(selectedArray[0]);
        return;
      }

      if (selectedArray.length === 0) return;

      // Burst-aware flagging: when a burst is selected in the grid, P/X applies to ALL
      // frames in the burst (not just the cover image). This lets a photographer reject
      // an entire 25-frame burst in one keystroke. Toggle triggers only when all frames
      // already share the same flag — prevents accidental unflag on partially-culled bursts.
      const getBurstIds = (id: string): string[] | null => {
        const img = images.find((i) => i.id === id);
        if (!img?.burstGroupId) return null;
        const burst = burstGroups.find((b) => b.id === img.burstGroupId);
        return burst ? burst.images.map((i) => i.id) : null;
      };

      // Helper: apply flag to burst (bulk toggle) or single image
      const applyFlag = (flag: 'pick' | 'reject') => {
        for (const id of selectedArray) {
          const burstIds = getBurstIds(id);
          if (burstIds) {
            // Check if all burst images already have this flag
            const allSame = burstIds.every((bid) => {
              const img = images.find((i) => i.id === bid);
              return img?.flag === flag;
            });
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
  }, [setRating, setFlag, setColorLabel, selectedIds, expandedBursts, toggleBurstExpand, showCommandPalette, toggleTheme, cycleOverlayMode, loupe.active, openLoupe, clearSelection, navItems, navRows, images, burstGroups]);

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
      <LoupeView />
    </div>
  );
}

export default App;
