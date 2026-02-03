import { useState } from 'react';
import { useImageStore } from '../stores/imageStore';
import './IngestPanel.css';

function IngestPanel() {
  const { importImages } = useImageStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImport();
  };

  const handleClick = () => {
    // In a real app, this would open a folder dialog
    // For now, just trigger mock import
    handleImport();
  };

  const handleImport = async () => {
    setIsImporting(true);
    
    // Simulate import delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    importImages();
    setIsImporting(false);
  };

  return (
    <div className="ingest-panel-overlay">
      <div className="ingest-panel">
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''} ${isImporting ? 'importing' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          {isImporting ? (
            <div className="import-progress">
              <div className="spinner"></div>
              <p>Importing images...</p>
            </div>
          ) : (
            <>
              <div className="folder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" />
                </svg>
              </div>
              <h2>Import Photos</h2>
              <p>Drop folder here or click to browse</p>
              <p className="hint">Supports RAW and JPEG formats</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default IngestPanel;