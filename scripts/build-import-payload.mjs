#!/usr/bin/env node
/**
 * Convert exiftool JSON → BurstResultPayload for browser-mode dev testing.
 * Replicates the Rust burst detection logic: group by serial, sort by time,
 * consecutive continuous-mode shots = burst.
 */
import { readFileSync, writeFileSync } from 'fs';

const input = process.argv[2] || 'public/test-data.json';
const output = process.argv[3] || 'public/import-payload.json';

const raw = JSON.parse(readFileSync(input, 'utf8'));

// Parse exiftool records into normalized form
function parseRecord(r) {
  const dt = r.DateTimeOriginal?.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') || '2000-01-01T00:00:00';
  const subsec = String(r.SubSecTimeOriginal ?? '0').padEnd(3, '0').slice(0, 3);
  const isoTime = `${dt}.${subsec}`;
  
  return {
    file_path: r.SourceFile,
    filename: r.FileName,
    serial_number: String(r.SerialNumber || r.InternalSerialNumber || 'unknown'),
    drive_mode: r.ShootingMode === 'Continuous' 
      ? (r.HighFrameRate === 'CH' ? 'ContinuousHigh' : 'ContinuousLow')
      : 'Single',
    capture_time: new Date(isoTime).toISOString(),
    capture_ms: new Date(isoTime).getTime(),
    make: r.Make || null,
    model: r.Model || null,
    lens: r.LensModel || null,
    focal_length: r.FocalLength ? parseFloat(r.FocalLength) : null,
    aperture: r.Aperture ?? null,
    shutter_speed: r.ShutterSpeed || null,
    iso: r.ISO ?? null,
    burst_group_id: r.BurstGroupID ?? null,
  };
}

const images = raw.map(parseRecord).sort((a, b) => a.capture_ms - b.capture_ms);

// Group by serial number
const bySerial = new Map();
for (const img of images) {
  const list = bySerial.get(img.serial_number) || [];
  list.push(img);
  bySerial.set(img.serial_number, list);
}

// Detect bursts per camera
const bursts = [];
const singles = [];
const cameraMap = new Map();

for (const [serial, cameraImages] of bySerial) {
  const make = cameraImages[0].make || 'Unknown';
  const model = cameraImages[0].model || 'Unknown';
  let burstCount = 0;

  // Sort by capture time
  cameraImages.sort((a, b) => a.capture_ms - b.capture_ms);

  // Group consecutive continuous shots by BurstGroupID (if available) or adjacency
  let currentBurst = [];
  let currentBurstGroupId = null;
  
  function flushBurst() {
    if (currentBurst.length >= 2) {
      bursts.push(buildBurst(currentBurst, serial));
      burstCount++;
    } else if (currentBurst.length === 1) {
      singles.push(stripMeta(currentBurst[0]));
    }
    currentBurst = [];
    currentBurstGroupId = null;
  }

  for (let i = 0; i < cameraImages.length; i++) {
    const img = cameraImages[i];
    const isContinuous = img.drive_mode !== 'Single';
    
    if (isContinuous) {
      // If BurstGroupID changes, flush previous burst
      if (img.burst_group_id != null && currentBurstGroupId != null && 
          img.burst_group_id !== currentBurstGroupId) {
        flushBurst();
      }
      currentBurstGroupId = img.burst_group_id;
      currentBurst.push(img);
    } else {
      flushBurst();
      singles.push(stripMeta(img));
    }
  }
  
  flushBurst();

  cameraMap.set(serial, {
    serial,
    make,
    model,
    image_count: cameraImages.length,
    burst_count: burstCount,
  });
}

function buildBurst(imgs, serial) {
  const sorted = [...imgs].sort((a, b) => a.capture_ms - b.capture_ms);
  const duration = sorted[sorted.length - 1].capture_ms - sorted[0].capture_ms;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].capture_ms - sorted[i - 1].capture_ms);
  }
  const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const fps = duration > 0 ? ((sorted.length - 1) / (duration / 1000)) : 0;
  
  return {
    id: `burst-${serial}-${sorted[0].capture_ms}`,
    camera_serial: serial,
    frame_count: sorted.length,
    duration_ms: duration,
    avg_gap_ms: avgGap,
    estimated_fps: Math.round(fps * 10) / 10,
    images: sorted.map(stripMeta),
  };
}

function stripMeta(img) {
  const { capture_ms, ...rest } = img;
  return rest;
}

const payload = {
  success: true,
  result: {
    total_images: images.length,
    total_bursts: bursts.length,
    total_singles: singles.length,
    cameras: Array.from(cameraMap.values()),
    bursts,
    singles,
  },
};

writeFileSync(output, JSON.stringify(payload, null, 2));
console.log(`✅ Payload written to ${output}`);
console.log(`   ${images.length} images, ${bursts.length} bursts, ${singles.length} singles`);
console.log(`   Cameras: ${Array.from(cameraMap.keys()).join(', ')}`);
