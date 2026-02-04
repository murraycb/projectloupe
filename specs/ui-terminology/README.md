# ProjectLoupe UI Terminology

Shared vocabulary for talking about the interface. Reference screenshots are in this directory.

---

## Layout Regions

```
┌─────────────────────────────────────────────────────────┬──────────────┐
│                      Filter Bar                         │              │
├─────────────────────────────────────────────────────────┤  Info Panel   │
│                                                         │              │
│                                                         │  (metadata,  │
│                    Main Canvas                          │   histogram, │
│                                                         │   file info) │
│              (Grid View or Loupe View)                  │              │
│                                                         │              │
│                                                         │              │
├─────────────────────────────────────────────────────────┴──────────────┤
│                          Status Bar                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Filter Bar
The top toolbar. Contains three filter groups and a toggle:
- **Rating filter**: ★ through ★★★★★ — filters to images at or above that rating
- **Flag filter**: Pick / Reject / Unflagged — shows only images with that flag state
- **Label filter**: Color dots (red, orange, green, blue, purple) — shows labeled images
- **Bursts toggle**: Shows only burst groups (hides singles)
- **Image count**: Right-aligned, shows total visible images

### Info Panel
Right sidebar. Shows metadata for the **selected** image:
- **Preview thumbnail**: Color swatch or thumbnail of selected image
- **Filename**: e.g., `Z9A_5186.NEF`
- **Camera section**: Camera body, lens
- **Exposure section**: Shutter, aperture, ISO, focal length
- **File section**: Full path, date/time
- **Burst section** (if applicable): Group ID
- **Histogram**: RGB histogram (when available)

### Status Bar
Bottom bar. Shows:
- **Image/burst count** (left): e.g., "73 images  11 bursts"
- **Selection count** (center): e.g., "1 selected"
- **Overlay mode** (right): e.g., "Overlay: minimal (J)" — shows current overlay level and shortcut
- **Pick/reject tallies** (right): e.g., "6 picks  7 rejects" in green/red

---

## Views

### Grid View
The default view. Shows thumbnails in a scrollable grid.
- **Screenshot**: `02-grid-with-flags.jpg`

### Loupe View
Full-screen single-image view. Entered by pressing **Enter** on a selected image or clicking a thumbnail.
- **Screenshot**: `03-loupe-view.jpg`
- **Loupe header**: Top bar showing filename, frame position ("Frame 1 of 7"), burst info (fps, duration), and exposure summary
- **Loupe overlay**: Below header — flag badge, rating stars, color label indicator
- **Navigation arrows**: Left/right chevrons at screen edges
- **ESC button**: Top-right, returns to Grid View
- **Filmstrip**: Bottom strip of thumbnails when viewing a burst (see below)

### Command Palette
Floating search/command dialog. Opened with **⌘K**. Lists available actions.

---

## Grid Elements

### Thumbnail Card
A single image cell in the grid. Shows:
- **Thumbnail image**: The photo (color swatch → micro → preview, progressive loading)
- **Filename label**: Below the thumbnail
- **Exposure label** (standard overlay): Shutter/aperture below filename
- **Selection border**: Neutral gray border on the currently selected card
- **Flag border**: Green (pick) or red (reject) border when flagged

### Burst Stack
A thumbnail card representing a group of burst frames. Distinguished by:
- **Burst badge**: Green circle in top-right corner with frame count (e.g., "6")
- **Burst subtitle**: Below filename — "Burst · 6 frames · 20.8 fps"
- **Cover image**: The displayed thumbnail — first pick > first unflagged > first frame

### Single
A non-burst thumbnail card. No burst badge. Subtitle shows exposure info in standard overlay mode.

### Camera Section
A group of thumbnails under a camera header. Header shows:
- **Camera name**: e.g., "NIKON CORPORATION NIKON Z 9"
- **Image count**: e.g., "40 images"

---

## Loupe Elements

### Filmstrip
Horizontal strip of small thumbnails at the bottom of Loupe View when viewing a burst. Shows all frames in the burst with:
- **Active frame highlight**: Border on current frame
- **Frame numbers**: Small index in bottom-right of each filmstrip thumbnail
- **Color-coded borders**: Green/red for pick/reject flags on individual frames
- **Color label bar**: Colored top border matching the frame's color label

### Loupe Header
Top bar in Loupe View:
- **Filename**: Left-aligned
- **Frame indicator**: "Frame 1 of 7" (bursts only)
- **Burst info**: "Burst · 20.0 fps · 0.3s" (bursts only)
- **Exposure summary**: Right-aligned — "1/1250  f/4.5  ISO 500  500mm"
- **ESC badge**: Button to exit loupe

### Loupe Overlay
Just below the header:
- **Flag badge**: "✕ Reject" (red) or "✓ Pick" (green) pill
- **Rating stars**: Yellow filled stars
- **Color label dot**: Colored indicator

---

## Overlay Modes

Cycled with **J** key. Controls how much metadata is shown on Grid thumbnails:

1. **Minimal**: Filename + burst subtitle only
2. **Standard**: Filename + exposure info (shutter/aperture)
3. **Full**: Filename + all metadata badges (rating, flag, label, exposure)
4. **Off**: Thumbnail only, no text overlay

Current mode shown in Status Bar: "Overlay: minimal (J)"

---

## Image States

### Flag States
- **Unflagged** (default): No border color — neutral gray selection border
- **Pick** (`P` key): Green border. Counts toward "picks" tally in status bar
- **Reject** (`X` key): Red border. Counts toward "rejects" tally in status bar

### Rating
0–5 stars, set with number keys `1`–`5`. `0` clears rating.

### Color Labels
Set with keys `6`–`9` (toggle on/off):
- `6`: Red
- `7`: Orange
- `8`: Green
- `9`: Blue
- Purple (not yet mapped)

---

## Modes & Concepts

### Review Mode
Activates automatically when any **content filter** is active (rating, flag, or color label filter). Changes behavior:
- Burst stacks flatten — individual frames shown separately
- Flagging/rating applies to individual frames, not whole bursts
- Navigation moves through filtered images only
- Auto-advance: when a mutation removes an image from the current filter, selection advances to the next visible image

**Not triggered by**: Bursts toggle or camera section filter — these are structural filters, not content filters.

### Selection / Cursor
The currently focused image in the grid. Shown with a neutral gray border. One image is always selected when images are loaded.
- **Arrow keys**: Move selection
- **Enter**: Open selected image in Loupe View
- When we say "the selection," "the cursor," or "the blue frame" — we mean this

### Cover Image
The representative image shown for a burst stack in grid view. Resolution order: first picked frame → first unflagged frame → first frame in the burst.

### Auto-Advance
When you flag/rate/label an image and that action removes it from the current filter, the selection automatically moves to the next visible image. No ghost/grace period — immediate advance.

---

## Keyboard Quick Reference

| Key | Action |
|-----|--------|
| ← → ↑ ↓ | Move selection in grid |
| Enter | Open Loupe / enter burst |
| Escape | Close Loupe / exit burst |
| P | Toggle Pick flag |
| X | Toggle Reject flag |
| U | Clear flag (Unflagged) |
| 1–5 | Set rating |
| 0 | Clear rating |
| 6–9 | Toggle color label |
| J | Cycle overlay mode |
| ⌘K | Command palette |
