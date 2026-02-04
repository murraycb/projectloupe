#!/bin/bash
# Export EXIF data from test-raws as JSON for browser-mode testing.
# Uses exiftool directly — same fields the Rust backend extracts.

RAWS_DIR="${1:-/Users/tinotran/.openclaw/workspace/projectloupe/test-raws}"
OUT="${2:-/Users/tinotran/.openclaw/workspace/projectloupe/public/test-data.json}"

echo "Extracting EXIF from: $RAWS_DIR"

exiftool -json \
  -SerialNumber \
  -InternalSerialNumber \
  -Make \
  -Model \
  -LensModel \
  -FocalLength \
  -Aperture \
  -ShutterSpeed \
  -ISO \
  -DateTimeOriginal \
  -SubSecTimeOriginal \
  -ShootingMode \
  -HighFrameRate \
  -BurstGroupID \
  -FileName \
  -fast \
  "$RAWS_DIR" > "$OUT"

echo "Wrote $(wc -l < "$OUT") lines to $OUT"
echo "Files: $(cat "$OUT" | grep '"FileName"' | wc -l)"
