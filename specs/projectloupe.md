# ProjectLoupe: AI-Powered Photo Culling Tool
*Project Specification v1.0*

## Vision & Goals

ProjectLoupe aims to be the modern replacement for Photo Mechanic, specifically targeting professional sports, wedding, and event photographers who need to cull thousands of images quickly and efficiently. The tool leverages local AI inference to provide intelligent photo sorting, burst grouping, and quality scoring while maintaining the speed and reliability that working photographers demand.

### Core Mission
- **Speed First**: Match or exceed Photo Mechanic's legendary performance
- **Local AI**: All inference runs locally for privacy, reliability, and speed
- **Professional Focus**: Built for working photographers, not hobbyists
- **Modern Architecture**: Future-proof tech stack with native performance

## Target Users

### Primary Audience
- **Sports Photographers**: Need to cull 2,000-10,000+ images per event
- **Wedding Photographers**: Process 3,000-8,000 images per wedding day
- **Event Photographers**: Handle high-volume corporate/social events

### User Personas
1. **Sarah - Sports Photographer**
   - Shoots 5,000+ images per game
   - Needs to deliver 100-200 selects within 2 hours
   - Currently uses Photo Mechanic + manual culling
   - Values: Speed, reliability, burst management

2. **Mike - Wedding Photographer**
   - Shoots 4,000-6,000 images per wedding
   - Delivers 500-800 final images
   - Needs consistent quality assessment
   - Values: AI assistance, batch processing, client deliverables

3. **Lisa - Event Photographer**
   - Covers corporate events and conferences
   - High volume, quick turnaround required
   - Mixed lighting conditions
   - Values: Automated quality scoring, face detection

## Tech Stack

### Core Architecture
- **Backend Core**: Rust + C++ hybrid for maximum performance
- **UI Layer**: Native platform UIs for optimal user experience
  - macOS: SwiftUI
  - Windows: WinUI 3
  - Linux: GTK4 (future consideration)

### AI/ML Stack
- **Inference Engine**: ONNX Runtime with platform-specific acceleration
  - macOS: CoreML backend for Neural Engine utilization
  - Windows: DirectML for GPU acceleration
  - Cross-platform: CPU fallback with SIMD optimizations
- **Model Format**: ONNX for cross-platform compatibility
- **Vision Models**: Custom trained models for photography-specific tasks

### Performance Requirements
- **Thumbnail Generation**: < 50ms per RAW file
- **AI Inference**: < 100ms per image analysis
- **Burst Detection**: Real-time during import
- **UI Responsiveness**: 60fps, < 16ms frame time

## MVP Scope: Burst Grouping & Best-Pick

### Core MVP Features

#### 1. Fast Ingest & Thumbnail Grid (Issue #16)
- **RAW Support**: CR2, NEF, ARW, DNG extraction
- **JPEG Embedding**: Extract embedded previews for speed
- **GPU Acceleration**: Hardware-accelerated thumbnail rendering
- **Aggressive Caching**: Pre-cache visible and adjacent thumbnails
- **Target Performance**: Match Photo Mechanic's speed

#### 2. Burst Grouping & Best-Pick (Issue #15) 🎯
- **Auto-Detection**: Analyze EXIF timestamps to identify burst sequences
- **Visual Grouping**: Stack bursts in UI with expandable/collapsible view
- **Best Frame Selection**: AI-powered ranking within each burst
  - Sharpness detection
  - Eye detection (open vs closed)
  - Subject positioning/composition
- **Manual Override**: Always allow photographer final decision

#### 3. AI Quality Scoring (Issue #17)
- **Image Quality Metrics**:
  - Focus/sharpness assessment
  - Exposure evaluation
  - Motion blur detection
  - Face detection and eye status
- **Non-Destructive**: Suggest only, never auto-delete
- **Visual Indicators**: Color-coded quality ratings
- **Batch Processing**: Score images during import

### MVP User Workflow
1. **Import**: Drag folder of images into ProjectLoupe
2. **Processing**: Auto-detection of bursts, quality scoring
3. **Review**: Visual burst groups with AI-suggested best picks
4. **Cull**: Quick accept/reject with keyboard shortcuts
5. **Export**: Selected images for further processing

## Milestone Breakdown

### MVP (3-4 months)
**Goal**: Replace Photo Mechanic for burst-heavy workflows

**Core Features**:
- Fast RAW thumbnail generation
- Burst detection and grouping
- Basic AI quality scoring
- Simple cull workflow (star ratings, colors)
- Export selected images

**Success Metrics**:
- Thumbnail speed matches Photo Mechanic
- 90%+ accuracy in burst grouping
- 70%+ photographer agreement with AI best-pick suggestions

### Version 1.0 (6-8 months)
**Goal**: Full-featured Photo Mechanic replacement

**Additional Features**:
- Semantic search with CLIP embeddings (Issue #18)
- Face detection and grouping (Issue #19)
- Advanced metadata editing
- Contact sheet generation
- Batch export workflows
- Plugin architecture foundation

**Success Metrics**:
- 10+ professional photographers using daily
- Feature parity with Photo Mechanic essentials
- Sub-5ms semantic search performance

### Version 2.0 (12-15 months)
**Goal**: AI-enhanced professional workflow

**Advanced Features**:
- Shot list matching for events (Issue #20)
- Adaptive style learning (Issue #21)
- Advanced AI suggestions (composition, storytelling)
- Cloud sync options (optional)
- Team collaboration features
- Mobile companion app

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────┐
│           Native UI Layer               │
│  (SwiftUI/WinUI/GTK - Platform Specific)│
├─────────────────────────────────────────┤
│              Rust Core                  │
│  • Image Management                     │
│  • Metadata Handling                    │
│  • File System Operations               │
│  • Database (SQLite)                    │
├─────────────────────────────────────────┤
│            C++ Engine                  │
│  • RAW Processing (LibRaw)             │
│  • Image Decoding/Encoding             │
│  • GPU Acceleration                    │
├─────────────────────────────────────────┤
│           AI Inference Layer           │
│  • ONNX Runtime                        │
│  • CoreML (macOS) / DirectML (Windows) │
│  • Model Management                    │
└─────────────────────────────────────────┘
```

### Data Flow
1. **Image Import**: C++ layer handles RAW decoding and thumbnail generation
2. **Metadata Extraction**: Rust layer processes EXIF, creates database entries
3. **AI Analysis**: ONNX models analyze images for quality, bursts, faces
4. **UI Updates**: Native UI receives processed data via Rust FFI bindings
5. **User Actions**: UI commands flow back through Rust to C++ for execution

### Database Schema
- **Images**: File paths, metadata, import timestamp, quality scores
- **Bursts**: Grouped image sequences with timing analysis
- **Tags**: User-applied and AI-generated tags
- **Collections**: User-defined image groupings
- **Preferences**: User settings and learned behaviors

## Cache Architecture & Performance Strategy

**Design principle:** Never touch RAW data for browsing. Everything the UI displays comes from cached derivatives. Table stakes: match or beat Photo Mechanic's responsiveness.

### Scale Assumptions
- Single shooting day: 5,000-7,000+ images (large sports tournament)
- Average RAW file: ~30MB → 150-210GB per import
- Multiple projects open simultaneously

### Three-Tier Cache

#### Tier 1: Thumbnail Atlas (Hot — In Memory)
- **What:** 400px thumbnails packed into a memory-mapped texture atlas
- **Size:** ~30-50KB per image → **350MB for 7,000 images** (fits in RAM)
- **When generated:** During import, as the very first step after EXIF read
- **Source:** Embedded JPEG preview in RAW file (seek + copy, no decode)
- **Performance target:** < 10ms per thumbnail extraction
- **Purpose:** Powers the grid view. Must feel instant when scrolling.
- **Format:** Memory-mapped atlas file — single mmap, no per-image file I/O

#### Tier 2: Mid-Resolution Previews (Warm — LRU Disk + Memory)
- **What:** ~1600px previews for the loupe/detail view
- **Size:** ~200-500KB per image → 1.4-3.5GB for 7,000 (too large for full RAM)
- **When generated:** Lazily on first view, then cached to disk
- **Memory policy:** LRU cache of last ~500 in memory, rest on SSD
- **Prefetch:** When browsing sequentially, pre-extract the next ~20 images ahead of scroll direction
- **Purpose:** Click-into-image detail view. Should load in < 100ms from cache, < 200ms on first generate.

#### Tier 3: Full RAW Decode (Cold — On Demand Only)
- **What:** Full-resolution decode via LibRaw
- **When:** Only for pixel-peeping, export, or AI analysis that needs full-res
- **Speed:** ~200-500ms per file — acceptable with loading indicator
- **Never batched for browsing.** This tier exists for intentional inspection.

### Import Pipeline (7,000 images)

```
Phase 1: Catalog (parallel, ~35-70s for 7,000 files)
├── Read EXIF metadata → SQLite
├── Extract embedded JPEG thumbnail → Tier 1 atlas
└── Compute file hash for cache keying

Phase 2: Background enrichment (async, non-blocking)
├── Burst detection (EXIF timestamps → grouping)
├── AI quality scoring (from Tier 1 thumbnails — no full decode needed)
└── Face detection for grouping

UI is interactive after Phase 1 completes.
Phase 2 runs in background — results appear progressively.
```

### Grid Rendering at Scale

- **Virtual scrolling mandatory** — only render the ~50-100 thumbnails visible on screen
- **Burst stacking reduces visual count:** 7,000 images → ~2,000 burst groups visually (60-70% reduction)
- **Intersection Observer pattern:** load thumbnails as grid cells enter viewport
- **Background I/O thread** — UI thread never blocks on disk reads
- **60fps target:** all rendering from Tier 1 atlas, zero disk I/O in the render path

### Cache Management

- **Key:** `{file_path}:{modification_timestamp}:{file_size}` — detects renames and edits
- **Location:** `~/.projectloupe/cache/{project-hash}/`
  - `atlas.bin` — memory-mapped thumbnail atlas
  - `previews/` — Tier 2 mid-res JPEGs
  - `metadata.sqlite` — EXIF, AI scores, burst groups, tags
- **Eviction:** LRU across projects, configurable max size (default 20GB)
- **Cleanup:** Automatic eviction of oldest project caches when limit hit
- **Portability:** Cache is regenerable — delete it and re-import, nothing is lost

### Performance Test Plan

**Goal:** Validate that ProjectLoupe meets or exceeds Photo Mechanic's performance at every step. Tests must run against real-world datasets from working photographers, not synthetic data.

#### Test Dataset Requirements
- **Small:** 500 images (quick iteration during development)
- **Medium:** 2,500 images (typical wedding shoot)
- **Large:** 7,000 images (full-day sports tournament)
- **XL:** 15,000 images (multi-day event / stress test)
- Mix of camera manufacturers (Canon CR3, Nikon NEF, Sony ARW, Fuji RAF)
- Must include actual burst sequences (sports continuous shooting)

#### Benchmark Suite

| Test | Metric | Target | Photo Mechanic Baseline |
|------|--------|--------|------------------------|
| Import 7,000 RAWs | Time to grid interactive | < 90s | ~60-90s |
| Grid scroll (7,000) | Frame rate during fast scroll | ≥ 60fps | 60fps |
| Grid scroll (7,000) | Thumbnail pop-in latency | < 16ms (1 frame) | Near-zero |
| Click to loupe view | Time to sharp preview | < 200ms | ~100-150ms |
| Burst detection (7,000) | Time to complete grouping | < 30s | N/A (manual) |
| AI quality score (7,000) | Time to score all images | < 120s | N/A |
| Memory usage (7,000) | Peak RSS | < 4GB | ~2-3GB |
| Memory usage (15,000) | Peak RSS | < 6GB | ~3-4GB |
| Cache cold start | Thumbnail atlas rebuild | < 120s | N/A |
| Search (7,000 indexed) | Metadata search response | < 50ms | ~instant |

#### Regression Protocol
- Run benchmark suite on every release candidate
- Track metrics over time in CI (chart performance trends)
- Any regression > 10% from baseline blocks release
- Test on both high-end (M4 Max) and mid-range (M2 Air) hardware
- Include a "Photo Mechanic parity test": import the same folder in both apps, measure side-by-side

#### Profiling Checkpoints
- Import pipeline: instrument each phase (EXIF read, thumbnail extract, SQLite write, burst detect)
- Rendering: frame time breakdown (atlas lookup, compositing, layout)
- Memory: track allocation patterns, identify leaks with 8+ hour soak test
- I/O: measure disk throughput vs theoretical SSD max — are we I/O bound or CPU bound?

## Key Technical Risks

### 1. Performance Bottlenecks
**Risk**: Not meeting Photo Mechanic's speed benchmarks
**Mitigation**:
- Benchmark against Photo Mechanic early and often
- Profile-guided optimization
- Hardware-specific optimizations (M-series, Intel, AMD)
- Consider assembly optimization for critical paths

### 2. RAW File Compatibility
**Risk**: Inconsistent rendering across camera manufacturers
**Mitigation**:
- Leverage LibRaw for broad format support
- Test with real-world samples from target photographers
- Implement format-specific optimizations
- Plan for rapid updates when new cameras release

### 3. AI Model Accuracy
**Risk**: Poor AI suggestions reduce user trust
**Mitigation**:
- Train on photographer-curated datasets
- Implement confidence scoring
- Always allow manual override
- Collect user feedback for model improvement

### 4. Cross-Platform Complexity
**Risk**: Native UI development increases complexity
**Mitigation**:
- Start with macOS as primary platform
- Share maximum code through Rust core
- Use platform UI guidelines strictly
- Consider hiring platform specialists

### 5. Memory Management
**Risk**: High-resolution images cause memory pressure
**Mitigation**:
- Implement smart caching strategies
- Use memory mapping for large files
- Progressive loading for thumbnails
- Monitor memory usage in production

## Development Priorities

### Phase 1: Foundation (Month 1-2)
- Set up build system and CI/CD
- Core Rust library with image metadata handling
- Basic C++ integration with LibRaw
- Simple thumbnail generation

### Phase 2: MVP Core (Month 3-4)
- Burst detection algorithms
- AI model integration (ONNX Runtime)
- Basic UI for burst grouping
- Quality scoring implementation

### Phase 3: Polish & Performance (Month 5-6)
- Performance optimization
- UI/UX refinement
- Professional photographer beta testing
- Bug fixes and stability improvements

## Success Criteria

### Technical Metrics
- Thumbnail generation: < 50ms per RAW file
- Burst grouping accuracy: > 90%
- AI quality scoring agreement: > 70% with photographers
- Memory usage: < 4GB for 10,000 image library
- UI responsiveness: Consistent 60fps

### Business Metrics
- 50+ professional photographers in beta program
- 10+ daily active users in first month post-launch
- Feature request pipeline from real user feedback
- Technical foundation for rapid feature iteration

### User Experience Goals
- Photographers can process 5,000+ images 30% faster than current workflow
- Learning curve < 1 hour for Photo Mechanic users
- Zero data loss or corruption incidents
- Positive feedback on AI suggestions from 80% of users

---

## Next Steps

1. **Issue #22**: Complete cross-platform architecture research
2. **Technical Prototype**: Build minimal working version for macOS
3. **Photographer Interviews**: Validate assumptions with target users
4. **Performance Benchmarking**: Establish baselines against Photo Mechanic
5. **AI Model Development**: Begin training photography-specific models

*This specification will evolve based on user feedback and technical discoveries during development.*