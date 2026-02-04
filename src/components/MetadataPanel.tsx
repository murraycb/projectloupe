import { useMemo } from 'react';
import { useImageStore } from '../stores/imageStore';
import './MetadataPanel.css';

function MetadataPanel() {
  const { images, selectedIds } = useImageStore();

  const selectedImage = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = Array.from(selectedIds)[0];
    return images.find(img => img.id === id) || null;
  }, [images, selectedIds]);

  const selectionCount = selectedIds.size;

  return (
    <div className="metadata-panel">
      <div className="panel-header">
        <h3>Info</h3>
      </div>

      <div className="panel-body">
        {selectionCount === 0 && images.length === 0 && (
          <div className="panel-empty">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V18H7V13H9M15,15V18H13V15H15M11,11V18H13V11H11" />
              </svg>
            </div>
            <p>Import photos to see metadata</p>
          </div>
        )}

        {selectionCount === 0 && images.length > 0 && (
          <div className="panel-empty">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M16.5,16.25C16.5,14.75 13.5,14 12,14C10.5,14 7.5,14.75 7.5,16.25V17H16.5M12,12.25A2.25,2.25 0 0,0 14.25,10A2.25,2.25 0 0,0 12,7.75A2.25,2.25 0 0,0 9.75,10A2.25,2.25 0 0,0 12,12.25Z" />
              </svg>
            </div>
            <p>Select an image to view details</p>
          </div>
        )}

        {selectionCount > 1 && (
          <div className="panel-multi">
            <p className="multi-count">{selectionCount} images selected</p>
            <p className="multi-hint">Select a single image for details</p>
          </div>
        )}

        {selectedImage && (
          <div className="metadata-content">
            <div className="metadata-preview">
              <div
                className="preview-placeholder"
                style={{
                  backgroundColor: `hsl(${(selectedImage as any)._placeholderHue || 200}, 60%, ${((selectedImage as any)._placeholderBrightness || 0.5) * 100}%)`,
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                  <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                </svg>
              </div>
            </div>

            <div className="metadata-filename">{selectedImage.filename}</div>

            <div className="metadata-section">
              <h4>Camera</h4>
              <div className="metadata-row">
                <span className="label">Camera</span>
                <span className="value">{selectedImage.exif.camera}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Lens</span>
                <span className="value">{selectedImage.exif.lens}</span>
              </div>
            </div>

            <div className="metadata-section">
              <h4>Exposure</h4>
              <div className="metadata-row">
                <span className="label">Shutter</span>
                <span className="value">{selectedImage.exif.shutterSpeed}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Aperture</span>
                <span className="value">f/{selectedImage.exif.aperture}</span>
              </div>
              <div className="metadata-row">
                <span className="label">ISO</span>
                <span className="value">{selectedImage.exif.iso}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Focal Length</span>
                <span className="value">{selectedImage.exif.focalLength}mm</span>
              </div>
            </div>

            <div className="metadata-section">
              <h4>File</h4>
              <div className="metadata-row">
                <span className="label">Path</span>
                <span className="value path">{selectedImage.path}</span>
              </div>
              <div className="metadata-row">
                <span className="label">Date</span>
                <span className="value">
                  {new Date(selectedImage.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {selectedImage.burstGroupId && (
              <div className="metadata-section">
                <h4>Burst</h4>
                <div className="metadata-row">
                  <span className="label">Group</span>
                  <span className="value">#{selectedImage.burstGroupId.slice(-4)}</span>
                </div>
                <div className="metadata-row">
                  <span className="label">Position</span>
                  <span className="value">
                    {selectedImage.burstIndex !== null ? selectedImage.burstIndex + 1 : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MetadataPanel;
