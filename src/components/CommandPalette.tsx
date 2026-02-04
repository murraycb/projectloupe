import { useState, useEffect, useRef, useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import './CommandPalette.css';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
}

function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    selectedIds,
    setRating,
    setFlag,
    setColorLabel,
    clearFilters,
    importFolder,
    cycleOverlayMode,
  } = useImageStore();

  const selectedArray = Array.from(selectedIds);

  const commands: Command[] = useMemo(() => [
    // Actions
    { id: 'pick', label: 'Flag as Pick', shortcut: 'P', category: 'Action', action: () => selectedArray.forEach(id => setFlag(id, 'pick')) },
    { id: 'reject', label: 'Flag as Reject', shortcut: 'X', category: 'Action', action: () => selectedArray.forEach(id => setFlag(id, 'reject')) },
    { id: 'unflag', label: 'Remove Flag', shortcut: 'U', category: 'Action', action: () => selectedArray.forEach(id => setFlag(id, 'none')) },
    { id: 'rate1', label: 'Rate 1 Star', shortcut: '1', category: 'Action', action: () => selectedArray.forEach(id => setRating(id, 1)) },
    { id: 'rate2', label: 'Rate 2 Stars', shortcut: '2', category: 'Action', action: () => selectedArray.forEach(id => setRating(id, 2)) },
    { id: 'rate3', label: 'Rate 3 Stars', shortcut: '3', category: 'Action', action: () => selectedArray.forEach(id => setRating(id, 3)) },
    { id: 'rate4', label: 'Rate 4 Stars', shortcut: '4', category: 'Action', action: () => selectedArray.forEach(id => setRating(id, 4)) },
    { id: 'rate5', label: 'Rate 5 Stars', shortcut: '5', category: 'Action', action: () => selectedArray.forEach(id => setRating(id, 5)) },
    { id: 'label-red', label: 'Label Red', shortcut: '6', category: 'Action', action: () => selectedArray.forEach(id => setColorLabel(id, 'red')) },
    { id: 'label-yellow', label: 'Label Yellow', shortcut: '7', category: 'Action', action: () => selectedArray.forEach(id => setColorLabel(id, 'yellow')) },
    { id: 'label-green', label: 'Label Green', shortcut: '8', category: 'Action', action: () => selectedArray.forEach(id => setColorLabel(id, 'green')) },
    { id: 'label-blue', label: 'Label Blue', shortcut: '9', category: 'Action', action: () => selectedArray.forEach(id => setColorLabel(id, 'blue')) },
    // View
    { id: 'cycle-overlay', label: 'Cycle Info Overlay', shortcut: 'J', category: 'View', action: cycleOverlayMode },
    { id: 'clear-filters', label: 'Clear All Filters', category: 'View', action: clearFilters },
    // File
    { id: 'import', label: 'Import Photos', category: 'File', action: importFolder },
  ], [selectedArray, setFlag, setRating, setColorLabel, clearFilters, importFolder, cycleOverlayMode]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onClose]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  let flatIndex = 0;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder="Type a command..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="command-list">
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category} className="command-group">
              <div className="command-category">{category}</div>
              {cmds.map(cmd => {
                const idx = flatIndex++;
                return (
                  <div
                    key={cmd.id}
                    className={`command-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={() => { cmd.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="command-label">{cmd.label}</span>
                    {cmd.shortcut && <span className="command-shortcut">{cmd.shortcut}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="command-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
