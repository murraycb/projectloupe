# ProjectLoupe UI Research
*Comprehensive UI Pattern Analysis for AI-Powered Photo Culling Tool*

## Executive Summary

ProjectLoupe targets professional photographers who cull 5,000-10,000+ images per session, replacing Photo Mechanic's speed with modern AI-powered assistance. This research analyzes competitive tools, modern UI patterns, and workflow optimizations to inform ProjectLoupe's interface design.

**Key Recommendation**: Build around four distinct workspace presets optimized for culling phases, with a VS Code-style panel system, dark-first design, and deep keyboard integration.

---

## 1. Competitive UI Analysis

### Photo Mechanic Plus - The Speed King

**Strengths:**
- **Lightning-fast contact sheet** - Renders thumbnails at incredible speed using embedded JPEG previews
- **Keyboard-first workflow** - Recently added customizable shortcuts (2024/2025 updates)
- **Burst grouping** - Stacks similar images automatically for efficient culling
- **Minimal interface chrome** - Everything focused on seeing more photos

**Weaknesses:**
- **Dated visual design** - Feels like early 2000s Windows app
- **Limited workspace customization** - Fixed panel layout
- **Poor typography and spacing** - Dense, cramped interface
- **Inconsistent iconography** - Mixed metaphors and sizes

**Essential Keyboard Shortcuts for ProjectLoupe:**
- `P` - Pick/flag image
- `X` - Reject/delete
- `1-5` - Star ratings  
- `Cmd+1-9` - Color labels
- `Space` - Quick zoom to 100%
- `Arrow keys` - Navigate images
- `J/K` - Previous/next with modifier keys for speed

**What we should take:** Speed obsession, keyboard workflow, contact sheet efficiency
**What we should improve:** Modern visual design, customizable workspace

### Lightroom Classic - The Workflow Standard

**Strengths:**
- **Four distinct view modes** optimized for different tasks:
  - **Grid (G)** - Contact sheet with metadata overlays
  - **Loupe (E)** - Full-size single image view
  - **Compare (C)** - Side-by-side comparison
  - **Survey (N)** - Multiple selected images for group evaluation
- **Metadata overlays** with customizable info display (J key cycles options)
- **Filter system** - Star ratings, color labels, flags work together
- **Panel system** - Collapsible, but fixed positions

**Weaknesses:**
- **Performance** - Sluggish with large catalogs
- **Overwhelming interface** - Too many options visible at once
- **Catalog management** - Added complexity vs. folder browsing
- **Fixed workspace layout** - Can't truly customize panel positions

**What we should take:** Multi-view concept, overlay system, filter combinations
**What we should improve:** Performance, workspace flexibility, UI simplicity

### Capture One - The Professional's Choice

**Strengths:**
- **Session-based workflow** - Project-focused organization without global catalogs
- **Customizable workspaces** - Save/restore entire panel layouts
- **Professional tethering** - Best-in-class live capture interface
- **Modular tools** - Right tool for the right job

**Weaknesses:**
- **Steep learning curve** - Complex workspace management
- **Overwhelming options** - Too many panels and tools for culling
- **Expensive** - High barrier to entry

**What we should take:** Workspace presets, session concept, professional feel
**What we should improve:** Simplicity, focus on culling vs. editing

### FastRawViewer - The Technical Specialist

**Strengths:**
- **True RAW histogram** - Shows actual file data, not JPEG preview
- **Technical overlays** - Focus peaking, exposure warnings, RGB histograms
- **Extreme speed** - Purpose-built for rapid RAW assessment
- **Minimal interface** - Photo is the hero

**Weaknesses:**
- **Limited workflow features** - Just viewing and basic rating
- **Niche appeal** - Too technical for most photographers
- **Poor design** - Functional but not beautiful

**What we should take:** Technical accuracy, speed focus, histogram integration
**What we should improve:** Workflow integration, visual polish

### Narrative Select - The AI Pioneer

**Strengths:**
- **AI-assisted culling** - Helps identify best shots automatically
- **Modern interface** - Clean, focused design
- **Fast processing** - Optimized for high-volume sessions
- **Photographer-focused** - Built specifically for culling workflow

**Weaknesses:**
- **Limited AI control** - Black box decision making
- **Mac-only for years** - Limited platform support
- **Workflow integration** - Doesn't replace full editing suite

**What we should take:** AI integration, culling focus, modern UI patterns
**What we should improve:** Platform support, workflow integration

---

## 2. Modern UI References

### Figma - Clean Panel Excellence

**Key Patterns:**
- **Contextual panels** - Only show relevant tools for current mode
- **Minimal chrome** - Clean borders, subtle shadows
- **Consistent iconography** - Single visual language throughout
- **Keyboard-accessible** - Every action has a shortcut
- **Component-based UI** - Reusable interface elements

**Application to ProjectLoupe:**
- Use contextual tool panels that change based on culling phase
- Adopt Figma's clean spacing and typography principles
- Implement consistent icon system for ratings, flags, metadata

### Linear - Keyboard-First Excellence  

**Key Patterns:**
- **Command palette** - `Cmd+K` access to all functions
- **Minimal visual noise** - Focus on content, not interface
- **Fast navigation** - Everything accessible via keyboard
- **Clean typography** - Excellent hierarchy and readability
- **Purposeful animations** - Smooth but not distracting

**Application to ProjectLoupe:**
- Implement command palette for all culling actions
- Use Linear's typography system for metadata display
- Adopt minimal visual design with focus on photos

### VS Code - Panel Management Master

**Key Patterns:**
- **Flexible panel docking** - Drag panels anywhere, create tabs
- **Workspace presets** - Save entire layouts for different tasks
- **Multi-monitor support** - Pop panels out to separate windows
- **Extension system** - Third-party tools integrate seamlessly

**Application to ProjectLoupe:**
- Use VS Code-style panel system as foundation
- Enable workspace presets for culling phases
- Support multi-monitor layouts for professional setups

---

## 3. Workspace Layout Patterns

### Docking System Requirements

**Must-Have Features:**
- **Panel drag-and-drop** - Intuitive repositioning
- **Tab groups** - Multiple tools in single panel area
- **Floating panels** - For multi-monitor setups
- **Snap zones** - Visual feedback during panel movement
- **Keyboard shortcuts** - Toggle panels without mouse

**Recommended Library: Dockview**
- **Zero dependencies** - Lightweight for Tauri integration
- **React/TypeScript support** - Matches modern web stack
- **API-driven** - Programmatic panel management
- **Multi-monitor support** - Essential for pro workflows
- **Active development** - Regular updates and bug fixes

**Alternative: FlexLayout**
- More downloads but heavier
- Good React integration
- Less modern API design

---

## 4. Phase-Based Workflow Design

### Hero Select Workspace
*Fast first pass through all images*

**Layout:**
```
[Toolbar: Minimal]
[Large Contact Sheet: 80% screen]  [Histogram: 20%]
[Navigation: Bottom bar with image counter]
```

**Key Features:**
- Large thumbnails (200-300px) for quick assessment
- Minimal UI chrome - no metadata panels
- One-key rating: `P` pick, `X` reject, `1-5` stars
- Fast keyboard navigation with visual feedback
- AI suggestions highlighted but not forced

### Review & Grade Workspace  
*Detailed evaluation of picked images*

**Layout:**
```
[Toolbar: Full tools]
[Image Grid: 40%] [Loupe View: 40%] [Metadata Panel: 20%]
[Compare Panel: Bottom when needed]
```

**Key Features:**
- Grid + loupe split view
- Full metadata panel with EXIF, keywords, captions
- Compare mode for similar shots
- Star ratings and color labels visible
- Zoom to 100% with spacebar

### Reject Culling Workspace
*Final review of borderline images*

**Layout:**  
```
[Side-by-side Compare: 80%]  [Decision Panel: 20%]
[Similar Image Groups: Bottom carousel]
```

**Key Features:**
- Focus on comparison tools
- AI-suggested similar images
- Quick delete with confirmation
- Undo stack for changed decisions

### Delivery Prep Workspace
*Organize final selections*

**Layout:**
```
[Selected Grid: 60%] [Batch Tools: 20%] [Export Queue: 20%]
[Metadata Editor: Bottom panel]
```

**Key Features:**
- Only shows selected images
- Batch metadata editing
- Export queue with progress
- Final organization tools

---

## 5. Input Device Patterns

### Keyboard Integration Strategy

**Essential Shortcuts (Photo Mechanic Compatible):**
```
P/X         - Pick/Reject (muscle memory from PM)
1-5         - Star ratings
Cmd+1-9     - Color labels  
Space       - 100% zoom toggle
G/E/C/N     - Grid/Enlarge/Compare/Survey (Lightroom compatible)
J/K         - Previous/Next image
Cmd+K       - Command palette (Linear pattern)
Tab         - Toggle UI chrome
F           - Fullscreen
Delete      - Move to trash
```

**Advanced Navigation:**
```
Shift+Arrow - Select range
Cmd+A       - Select all visible
Cmd+D       - Deselect all
[/]         - Previous/next flagged
{/}         - Previous/next starred
```

### Hardware Controller Integration

**Logitech MX Creative Console Integration:**
- **Dial**: Scrub through images in grid or timeline
- **Button Pad**: Custom mapping for pick/reject/ratings
- **Software Integration**: Custom plugin for ProjectLoupe

**TourBox/Loupedeck Compatibility:**
- **Dials**: Image navigation, zoom control, thumbnail size
- **Buttons**: Ratings, flags, workspace switching
- **Touch Interface**: Direct manipulation of UI elements

**Stream Deck Integration:**
- **Workspace buttons** - Switch between culling phases  
- **Batch actions** - Apply ratings to selected images
- **Export presets** - One-click delivery workflows
- **Client review** - Live view for over-shoulder feedback

### Mouse/Context Menu Patterns

**Right-click Context Menu:**
```
Rate > 1-5 stars
Flag > Pick/Reject/Unflagged  
Color > Red/Yellow/Green/Blue/Purple
Compare with > Similar shots
Move to > Collection/Folder
Copy settings from > Previous image
Export > Client gallery/High-res
```

**Hover Previews:**
- Larger thumbnail preview on grid hover
- Metadata tooltip with key EXIF data
- Rating overlay with visual star display
- Focus indicator overlay (red/green zones)

---

## 6. Visual Design Principles

### Color Strategy for Photographers

**Dark Theme as Default:**
- **Background**: `#1a1a1a` - True black causes eye strain
- **Panel backgrounds**: `#2a2a2a` - Subtle differentiation
- **Text primary**: `#ffffff` - High contrast for readability
- **Text secondary**: `#b3b3b3` - Metadata and labels
- **Accent**: `#0066cc` - Single brand color for actions

**Color-Neutral Interface:**
- No colored UI elements that compete with photos
- Rating stars use subtle gold `#ffd700` only when active
- Color labels use desaturated versions of standard colors
- Focus indicators use subtle outline, not colored fills

### Typography Hierarchy

**Primary Text (Image names, headings):**
- Font: SF Pro Display / Segoe UI
- Size: 14px, Weight: 500
- Color: `#ffffff`

**Secondary Text (Metadata, timestamps):**  
- Font: SF Pro Text / Segoe UI
- Size: 12px, Weight: 400
- Color: `#b3b3b3`

**Monospace Text (Technical data):**
- Font: SF Mono / Consolas  
- Size: 11px, Weight: 400
- Color: `#cccccc`

### Thumbnail Design Standards

**Selection States:**
- **Normal**: 2px transparent border
- **Hover**: 2px `#333333` border with subtle glow
- **Selected**: 2px `#0066cc` border
- **Picked**: Green corner indicator
- **Rejected**: Red corner indicator with strikethrough overlay

**Rating Overlays:**
- Stars appear in top-right corner
- Filled stars use `#ffd700`, empty use `#666666`
- Scale with thumbnail size (min 12px, max 16px)

**Metadata Overlays:**
- Filename always visible at bottom
- Technical data (ISO, aperture, shutter) optional overlay
- Semi-transparent black background for text legibility

### Animation Principles

**Purposeful Motion:**
- Panel transitions: 200ms ease-in-out
- Image loading: Fade in over 100ms
- Hover states: 150ms ease
- Focus changes: 100ms ease for immediate feedback

**Performance Constraints:**  
- No animations during rapid navigation
- Reduce motion setting respected
- GPU-accelerated transforms only

---

## 7. Smart Panel/Docking System

### Technical Implementation

**Recommended: Dockview Library**
```typescript
// Example integration for ProjectLoupe
import { DockviewReact, DockviewReadyEvent } from 'dockview';

const panels = {
  grid: GridPanel,
  loupe: LoupePanel, 
  metadata: MetadataPanel,
  histogram: HistogramPanel,
  compare: ComparePanel
};

const workspacePresets = {
  heroSelect: {
    layout: 'grid-primary',
    panels: ['grid', 'histogram'],
    shortcuts: { p: 'pick', x: 'reject' }
  },
  reviewGrade: {
    layout: 'grid-loupe-split',
    panels: ['grid', 'loupe', 'metadata'],
    shortcuts: { space: 'zoom-toggle' }
  }
};
```

**Panel Management Features:**
- **Save/restore layouts** - Workspace presets system
- **Multi-monitor support** - Pop panels to separate windows
- **Keyboard shortcuts** - Toggle specific panels
- **API integration** - Programmatic panel control
- **Theme integration** - Consistent with app design

### Tauri Integration Considerations

**Window Management:**
- Main window hosts primary docking area
- Secondary windows for multi-monitor panels
- Native window controls for professional feel
- Proper focus management between windows

**Performance:**
- Panel content virtualization for large image sets
- Lazy loading of non-visible panel content
- Native file system access for speed
- GPU acceleration for smooth animations

---

## Specific Recommendations for ProjectLoupe

### 1. Start with Hero Select Workspace
Build the fastest possible first-pass culling interface:
- Large grid view (200-300px thumbnails)
- Minimal UI chrome
- One-key pick/reject workflow
- AI suggestions as subtle visual hints

### 2. Implement VS Code-style Panel System
Use Dockview for flexible workspace management:
- Four preset workspace layouts
- Drag-and-drop panel repositioning  
- Multi-monitor support from day one
- Save custom workspace configurations

### 3. Dark-First Design with Photographer Sensibilities
- Default dark theme with true color-neutral interface
- Subtle typography hierarchy for metadata
- Clean selection states without color pollution
- Premium feel worthy of professional photographers

### 4. Progressive Disclosure of Features
- Start simple (grid + pick/reject)
- Add complexity through workspace progression
- Hide advanced features until needed
- Maintain speed as primary differentiator

### 5. Hardware Integration Strategy
- Plan for Logitech MX Creative Console integration
- Support TourBox and Loupedeck through plugin system
- Stream Deck integration for workspace switching
- Mouse-first but keyboard-optimized

### 6. AI Integration Philosophy
Follow Narrative Select's "AI-assisted" approach:
- Highlight AI suggestions subtly
- Never auto-select without user confirmation
- Provide confidence indicators for AI recommendations
- Allow users to train/correct AI over time

### 7. Performance-First Architecture
- True RAW histogram display (FastRawViewer model)
- Thumbnail caching and preloading
- Background AI processing
- Instant workspace switching

This research provides the foundation for building ProjectLoupe as a truly modern photo culling tool that respects photographer workflows while bringing AI assistance and contemporary UI patterns to the professional photography market.