# ProjectLoupe

AI-powered photo culling app for professional photographers.

## Features

- **Burst Detection**: Automatically groups burst sequences for easier review
- **Smart Filtering**: Filter by rating, flags, color labels, and burst groups
- **Virtual Scrolling**: Smooth performance with large photo collections
- **Keyboard Shortcuts**: Professional-grade keyboard shortcuts for fast culling
- **Modern UI**: Dark theme optimized for long editing sessions

## Keyboard Shortcuts

### Rating & Flagging
- `1-5`: Set star rating
- `P`: Flag as pick
- `X`: Flag as reject  
- `U`: Remove flag

### Color Labels
- `6`: Red label
- `7`: Yellow label
- `8`: Green label
- `9`: Blue label

### Navigation
- `Arrow keys`: Navigate selection
- `Escape`: Collapse expanded burst groups

## Development

### Prerequisites

- Node.js 18+
- Rust 1.77.2+
- Tauri CLI: `npm install -g @tauri-apps/cli@latest`

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run tauri dev`

### Building

```bash
npm run tauri build
```

## Architecture

ProjectLoupe is built with:

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri v2
- **State Management**: Zustand
- **Virtual Scrolling**: @tanstack/react-virtual
- **Workspace Structure**: Multi-crate Rust workspace

The Rust code is organized into:
- `crates/burst-detection`: Core image analysis and burst detection
- `src-tauri`: Tauri app integration and UI commands

## License

MIT