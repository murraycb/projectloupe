import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useImageStore } from '../stores/imageStore';
import './MetadataPanel.css';

/** RGB histogram rendered via canvas. Samples from the thumbnail image. */
function Histogram({ imageUrl }: { imageUrl: string | undefined }) {
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const histDataRef = useRef<{ r: number[]; g: number[]; b: number[]; lum: number[] } | null>(null);
  const lastUrlRef = useRef<string | undefined>();

  const drawHistogram = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const data = histDataRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    canvas.width = W;
    canvas.height = H;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Find max for scaling (exclude bin 0 and 255 — they spike from clipping)
    const maxVal = Math.max(
      ...data.r.slice(1, 255),
      ...data.g.slice(1, 255),
      ...data.b.slice(1, 255),
    );
    if (maxVal === 0) return;

    const binWidth = w / 256;

    const drawChannel = (bins: number[], color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < 256; i++) {
        const val = Math.min(bins[i], maxVal);
        const barH = (val / maxVal) * h;
        ctx.lineTo(i * binWidth, h - barH);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    };

    drawChannel(data.lum, 'rgba(255, 255, 255, 0.1)');
    drawChannel(data.r, 'rgba(255, 80, 80, 0.4)');
    drawChannel(data.g, 'rgba(80, 200, 80, 0.35)');
    drawChannel(data.b, 'rgba(100, 140, 255, 0.4)');
  }, []);

  useEffect(() => {
    if (!imageUrl || imageUrl === lastUrlRef.current) return;
    lastUrlRef.current = imageUrl;
    histDataRef.current = null;

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = offscreenRef.current!;
      const scale = Math.min(1, 200 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h).data;

      const r = new Array(256).fill(0);
      const g = new Array(256).fill(0);
      const b = new Array(256).fill(0);
      const lum = new Array(256).fill(0);

      for (let i = 0; i < pixels.length; i += 4) {
        r[pixels[i]]++;
        g[pixels[i + 1]]++;
        b[pixels[i + 2]]++;
        const l = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
        lum[Math.min(255, l)]++;
      }

      histDataRef.current = { r, g, b, lum };
      drawHistogram();
    };
    img.src = imageUrl;
  }, [imageUrl, drawHistogram]);

  // Redraw on resize for crisp rendering
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawHistogram());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawHistogram]);

  if (!imageUrl) return null;

  return (
    <div className="histogram-container">
      <canvas ref={drawCanvasRef} className="histogram-canvas" />
    </div>
  );
}

function MetadataPanel() {
  const { imageMap, selectedIds } = useImageStore();

  // Show metadata for whatever is selected — the grid nav and loupe
  // are responsible for selecting the correct image (cover for bursts, current for loupe)
  const selectedImage = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = Array.from(selectedIds)[0];
    return imageMap.get(id) ?? null;
  }, [imageMap, selectedIds]);

  const thumbnailUrl = selectedImage
    ? (selectedImage.previewThumbnailUrl || selectedImage.microThumbnailUrl || selectedImage.thumbnailUrl)
    : undefined;

  // Aggregate stats for multi-selection
  const multiStats = useMemo(() => {
    if (selectedIds.size <= 1) return null;
    let picks = 0, rejects = 0, unflagged = 0, rated = 0;
    let totalRating = 0;
    const cameras = new Set<string>();
    const labels = new Map<string, number>();

    for (const id of selectedIds) {
      const img = imageMap.get(id);
      if (!img) continue;
      if (img.flag === 'pick') picks++;
      else if (img.flag === 'reject') rejects++;
      else unflagged++;
      if (img.rating > 0) { rated++; totalRating += img.rating; }
      if (img.exif.camera) cameras.add(img.exif.camera);
      if (img.colorLabel !== 'none') {
        labels.set(img.colorLabel, (labels.get(img.colorLabel) || 0) + 1);
      }
    }

    return { picks, rejects, unflagged, rated, avgRating: rated > 0 ? totalRating / rated : 0, cameras, labels };
  }, [imageMap, selectedIds]);

  const selectionCount = selectedIds.size;
  const hasImages = imageMap.size > 0;

  return (
    <div className="metadata-panel">
      <div className="panel-body">
        {selectionCount === 0 && !hasImages && (
          <div className="panel-empty">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V18H7V13H9M15,15V18H13V15H15M11,11V18H13V11H11" />
              </svg>
            </div>
            <p>Import photos to see metadata</p>
          </div>
        )}

        {selectionCount === 0 && hasImages && (
          <div className="panel-empty">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                <path d="M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M16.5,16.25C16.5,14.75 13.5,14 12,14C10.5,14 7.5,14.75 7.5,16.25V17H16.5M12,12.25A2.25,2.25 0 0,0 14.25,10A2.25,2.25 0 0,0 12,7.75A2.25,2.25 0 0,0 9.75,10A2.25,2.25 0 0,0 12,12.25Z" />
              </svg>
            </div>
            <p>Select an image to view details</p>
          </div>
        )}

        {selectionCount > 1 && multiStats && (
          <div className="multi-summary">
            <div className="multi-header">{selectionCount} images selected</div>

            <div className="metadata-section">
              <h4>Flags</h4>
              {multiStats.picks > 0 && (
                <div className="metadata-row">
                  <span className="label">Picks</span>
                  <span className="value pick">{multiStats.picks}</span>
                </div>
              )}
              {multiStats.rejects > 0 && (
                <div className="metadata-row">
                  <span className="label">Rejects</span>
                  <span className="value reject">{multiStats.rejects}</span>
                </div>
              )}
              {multiStats.unflagged > 0 && (
                <div className="metadata-row">
                  <span className="label">Unflagged</span>
                  <span className="value">{multiStats.unflagged}</span>
                </div>
              )}
            </div>

            {multiStats.rated > 0 && (
              <div className="metadata-section">
                <h4>Ratings</h4>
                <div className="metadata-row">
                  <span className="label">Rated</span>
                  <span className="value">{multiStats.rated}</span>
                </div>
                <div className="metadata-row">
                  <span className="label">Average</span>
                  <span className="value">{'★'.repeat(Math.round(multiStats.avgRating))} {multiStats.avgRating.toFixed(1)}</span>
                </div>
              </div>
            )}

            {multiStats.labels.size > 0 && (
              <div className="metadata-section">
                <h4>Labels</h4>
                {Array.from(multiStats.labels).map(([label, count]) => (
                  <div className="metadata-row" key={label}>
                    <span className={`label-dot ${label}`} />
                    <span className="label" style={{ textTransform: 'capitalize' }}>{label}</span>
                    <span className="value">{count}</span>
                  </div>
                ))}
              </div>
            )}

            {multiStats.cameras.size > 0 && (
              <div className="metadata-section">
                <h4>Cameras</h4>
                {Array.from(multiStats.cameras).map((cam) => (
                  <div className="metadata-row" key={cam}>
                    <span className="value" style={{ fontSize: '11px' }}>{cam}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedImage && (
          <div className="metadata-content">
            <div className="metadata-preview">
              {(selectedImage.previewThumbnailUrl || selectedImage.microThumbnailUrl || selectedImage.thumbnailUrl) ? (
                <img
                  className="preview-image"
                  src={selectedImage.previewThumbnailUrl || selectedImage.microThumbnailUrl || selectedImage.thumbnailUrl}
                  alt={selectedImage.filename}
                  draggable={false}
                />
              ) : (
                <div
                  className="preview-placeholder"
                  style={{
                    backgroundColor: selectedImage.colorSwatch
                      || `hsl(${selectedImage._placeholderHue || 200}, 60%, ${(selectedImage._placeholderBrightness || 0.5) * 100}%)`,
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                    <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                  </svg>
                </div>
              )}

              {/* Flag indicator */}
              {selectedImage.flag === 'pick' && <div className="thumb-flag pick" />}
              {selectedImage.flag === 'reject' && (
                <>
                  <div className="thumb-flag reject" />
                  <div className="thumb-reject-line" />
                </>
              )}

              {/* Star rating */}
              {selectedImage.rating > 0 && (
                <div className="thumb-stars">
                  {'★'.repeat(selectedImage.rating)}
                </div>
              )}

              {/* Color label strip */}
              {selectedImage.colorLabel !== 'none' && (
                <div className={`thumb-color-strip ${selectedImage.colorLabel}`} />
              )}
            </div>

            <Histogram imageUrl={thumbnailUrl} />

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
