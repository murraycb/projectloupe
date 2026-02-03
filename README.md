# ProjectLoupe

An AI-powered photo culling application designed for professional photographers to quickly sort and organize large photo collections with intelligent burst detection and quality analysis.

## Features

- **Intelligent Burst Detection**: Automatically groups sequential photos taken within 2 seconds
- **Virtual Scrolling**: Efficiently handles thousands of images without performance loss
- **Advanced Filtering**: Filter by star rating, flag status, and color labels
- **Professional Rating System**: P/X for pick/reject, 1-5 for star ratings, 6-0 for color labels
- **Keyboard Shortcuts**: Blazing fast workflow with industry-standard shortcuts
- **Dark Theme**: Eye-friendly interface that doesn't compete with your photos

## Tech Stack

- **Backend**: Tauri v2 (Rust)
- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **Virtual Scrolling**: react-window
- **Panel Management**: Dockview (ready for future expansion)

## Prerequisites

- **Node.js** 18+ (for frontend)
- **Rust** 1.77.2+ (for Tauri backend)
- **Tauri CLI** (install with `cargo install tauri-cli@2`)

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/murraycb/projectloupe.git
   cd projectloupe
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri:dev
   ```

4. **Build for production**:
   ```bash
   npm run tauri:build
   ```

## Project Structure

```
projectloupe/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── App.tsx        # Main app component
│   │   ├── ThumbnailGrid.tsx # Virtual scrolling grid
│   │   ├── BurstGroup.tsx # Burst grouping component
│   │   ├── FilterBar.tsx  # Filtering interface
│   │   └── IngestPanel.tsx # Import interface
│   ├── stores/            # Zustand state management
│   │   └── imageStore.ts  # Main app state
│   ├── types/             # TypeScript definitions
│   │   └── index.ts       # Core types
│   ├── mock/              # Mock data generation
│   │   └── generateMockData.ts
│   └── styles/            # Global CSS
│       └── global.css     # Dark theme styles
├── src-tauri/             # Tauri Rust backend
│   ├── src/               # Rust source code
│   │   ├── main.rs        # Tauri entry point
│   │   ├── burst.rs       # Burst detection logic
│   │   ├── image_info.rs  # EXIF extraction
│   │   ├── quality.rs     # Image quality analysis
│   │   └── lib.rs         # Library exports
│   ├── Cargo.toml         # Rust dependencies
│   ├── build.rs           # Build script
│   └── tauri.conf.json    # Tauri configuration
├── package.json           # Frontend dependencies
├── vite.config.ts         # Vite configuration
└── tsconfig.json          # TypeScript configuration
```

## Keyboard Shortcuts

### Rating & Flagging
- **P** - Mark as pick (green flag)
- **X** - Mark as reject (red flag)
- **U** - Unflag
- **1-5** - Set star rating (1-5 stars)

### Color Labels
- **6** - Red label
- **7** - Yellow label
- **8** - Green label
- **9** - Blue label
- **0** - Purple label

### Navigation
- **Arrow Keys** - Navigate between images
- **Shift+Click** - Range selection
- **Cmd/Ctrl+Click** - Multi-selection
- **Enter/Space** - Expand/collapse burst groups
- **Escape** - Collapse expanded burst groups

## Current Status

This is the initial scaffold with:
- ✅ Tauri v2 setup with existing Rust burst detection code
- ✅ React frontend with TypeScript
- ✅ Virtual scrolling thumbnail grid
- ✅ Burst grouping with visual stacking
- ✅ Rating and flagging system
- ✅ Advanced filtering
- ✅ Dark theme optimized for photo work
- ✅ Mock data generation for development

### Next Steps
1. Integrate real file system access via Tauri commands
2. Connect frontend to Rust burst detection backend
3. Implement actual image thumbnail generation
4. Add docking panel management
5. Integrate quality analysis features

## Contributing

This project is currently in active development. The existing Rust code for burst detection has been preserved and integrated into the Tauri structure.

## License

MIT License - See LICENSE file for details