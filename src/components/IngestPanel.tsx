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
    handleImport();
  };

  const handleImport = async () => {
    setIsImporting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    importImages();
    setIsImporting(false);
  };

  return (
    <div className="ingest-panel-inline">
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" />
              </svg>
            </div>
            <h3>Import Photos</h3>
            <p>Drop a folder here or click to browse</p>
            <p className="hint">Supports RAW and JPEG formats</p>
          </>
        )}
      </div>
    </div>
  );
}

export default IngestPanel;
