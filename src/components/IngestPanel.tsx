import { useImageStore } from '../stores/imageStore';
import './IngestPanel.css';

function IngestPanel() {
  const { importFolder, importMock, isImporting, importError } = useImageStore();

  const handleClick = () => {
    importFolder();
  };

  const handleMock = (e: React.MouseEvent) => {
    e.stopPropagation();
    importMock();
  };

  return (
    <div className="ingest-panel-inline">
      <div
        className={`drop-zone ${isImporting ? 'importing' : ''}`}
        onClick={!isImporting ? handleClick : undefined}
      >
        {isImporting ? (
          <div className="import-progress">
            <div className="spinner"></div>
            <p>Scanning folder and detecting bursts…</p>
          </div>
        ) : (
          <>
            <div className="folder-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" />
              </svg>
            </div>
            <h3>Import Photos</h3>
            <p>Click to select a folder</p>
            <p className="hint">Supports RAW (CR3, NEF, ARW, DNG, RAF) and JPEG</p>
            <button className="mock-button" onClick={handleMock}>
              Load mock data
            </button>
          </>
        )}
        {importError && (
          <div className="import-error">
            <p>{importError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default IngestPanel;
