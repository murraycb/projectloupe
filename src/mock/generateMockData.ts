import { ImageEntry } from '../types';

const cameras = ['Nikon Z9', 'Canon R5', 'Sony A1'] as const;
type CameraType = typeof cameras[number];

const lenses = ['70-200mm f/2.8', '24-70mm f/2.8', '85mm f/1.4'];
const filenamePrefixes: Record<CameraType, string> = {
  'Nikon Z9': 'DSC_',
  'Canon R5': '_MG_',
  'Sony A1': 'DSC'
};
const fileExtensions: Record<CameraType, string> = {
  'Nikon Z9': '.NEF',
  'Canon R5': '.CR3',
  'Sony A1': '.ARW'
};

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateShutterSpeed(): string {
  const speeds = ['1/60', '1/125', '1/250', '1/500', '1/1000', '1/2000', '1/4000', '1/8000'];
  return randomChoice(speeds);
}

function generateHue(): number {
  return Math.floor(Math.random() * 360);
}

function generateBrightness(): number {
  return 0.3 + Math.random() * 0.4; // 30-70%
}

export function generateMockImages(): ImageEntry[] {
  const images: ImageEntry[] = [];
  let currentTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000); // Start a week ago
  let imageCounter = 1000;
  
  // Generate ~15-20 burst groups
  const burstGroupCount = randomBetween(15, 20);
  
  for (let i = 0; i < burstGroupCount; i++) {
    const burstId = `burst_${i}`;
    const burstSize = randomBetween(3, 8);
    const camera = randomChoice(cameras);
    const lens = randomChoice(lenses);
    const baseHue = generateHue();
    const baseBrightness = generateBrightness();
    
    // Add some gap before burst
    currentTimestamp += randomBetween(60000, 300000); // 1-5 minutes
    
    for (let j = 0; j < burstSize; j++) {
      const filename = `${filenamePrefixes[camera]}${String(imageCounter).padStart(4, '0')}${fileExtensions[camera]}`;
      
      images.push({
        id: `img_${imageCounter}`,
        filename,
        path: `/mock/photos/${filename}`,
        timestamp: currentTimestamp,
        exif: {
          iso: randomChoice([100, 200, 400, 800, 1600, 3200, 6400, 12800]),
          aperture: randomChoice([1.4, 1.8, 2.8, 4, 5.6, 8, 11]),
          shutterSpeed: generateShutterSpeed(),
          focalLength: randomBetween(24, 200),
          camera,
          lens
        },
        rating: randomBetween(0, 5),
        flag: randomChoice(['none', 'none', 'none', 'pick', 'reject'] as const), // Most are unflagged
        colorLabel: randomChoice(['none', 'none', 'none', 'red', 'yellow', 'green', 'blue', 'purple'] as const),
        burstGroupId: burstId,
        burstIndex: j,
        // Store hue and brightness for placeholder color
        _mockHue: baseHue + (j * 5), // Slight variation within burst
        _mockBrightness: baseBrightness
      } as ImageEntry & { _mockHue: number; _mockBrightness: number });
      
      imageCounter++;
      // Small gap within burst (0.5-2 seconds)
      if (j < burstSize - 1) {
        currentTimestamp += randomBetween(500, 2000);
      }
    }
  }
  
  // Fill remaining ~80 images as singles
  const remainingImages = 100 - images.length;
  
  for (let i = 0; i < remainingImages; i++) {
    const camera = randomChoice(cameras);
    const filename = `${filenamePrefixes[camera]}${String(imageCounter).padStart(4, '0')}${fileExtensions[camera]}`;
    
    // Random gap before next single
    currentTimestamp += randomBetween(60000, 1800000); // 1-30 minutes
    
    images.push({
      id: `img_${imageCounter}`,
      filename,
      path: `/mock/photos/${filename}`,
      timestamp: currentTimestamp,
      exif: {
        iso: randomChoice([100, 200, 400, 800, 1600, 3200, 6400, 12800]),
        aperture: randomChoice([1.4, 1.8, 2.8, 4, 5.6, 8, 11]),
        shutterSpeed: generateShutterSpeed(),
        focalLength: randomBetween(24, 200),
        camera,
        lens: randomChoice(lenses)
      },
      rating: randomBetween(0, 5),
      flag: randomChoice(['none', 'none', 'none', 'pick', 'reject'] as const),
      colorLabel: randomChoice(['none', 'none', 'none', 'red', 'yellow', 'green', 'blue', 'purple'] as const),
      burstGroupId: null,
      burstIndex: null,
      _mockHue: generateHue(),
      _mockBrightness: generateBrightness()
    } as ImageEntry & { _mockHue: number; _mockBrightness: number });
    
    imageCounter++;
  }
  
  // Sort by timestamp
  images.sort((a, b) => a.timestamp - b.timestamp);
  
  return images;
}