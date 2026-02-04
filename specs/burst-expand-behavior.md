# Burst Expand/Collapse Behavior Spec

## Overview

Burst groups have two visual states in the grid: **collapsed** (stack card) and **expanded** (individual frames). The expand/collapse state changes how the user interacts with burst images — collapsed treats the burst as a unit, expanded treats frames as individuals.

## States

### Collapsed (Stack Card)
- Single card with stack layers, cover image, and count badge (e.g., "6")
- Cover image = first pick → first unflagged → first frame
- Click badge to expand
- Click card body to open loupe on cover image
- **All mutations are burst-level**: flag/rate/label applies to ALL frames in the burst

### Expanded (Individual Frames)
- Stack card is hidden; individual frames render in the grid with position badges (e.g., "1/6", "2/6")
- Click any frame's badge to collapse back to stack
- Click frame body to select that individual frame
- Double-click frame to open loupe on that frame
- **All mutations are frame-level**: flag/rate/label applies ONLY to the selected frame(s)

## Mutation Scoping Rules

| Action | Collapsed | Expanded |
|--------|-----------|----------|
| Flag (P/X/U) | All frames in burst | Selected frame only |
| Rating (0-5) | All frames in burst | Selected frame only |
| Color label (6-9) | Selected frame only¹ | Selected frame only |
| Delete (future) | All frames in burst | Selected frame only |

¹ Color labels are already individual-only in collapsed mode (existing behavior).

> **Principle**: Expanding a burst is an explicit user action to work at the frame level. The app should respect that intent. Collapsing returns to burst-level behavior.

## Keyboard Navigation

### Collapsed
- Arrow keys navigate between burst stacks (cover image represents the burst)
- E key expands the selected burst → cursor moves to calculated cover frame

### Expanded
- Arrow keys navigate through individual frames sequentially (1→2→3→...→N→next item)
- E key collapses the burst → cursor stays on current frame's burst stack
- All frames are in the nav item list; none are skipped

### Both States
- Enter opens loupe on the selected image
- J cycles overlay mode (affects all cards globally)

## Expand Trigger
- Click count badge on stack card
- Press E with a burst stack selected

## Collapse Trigger
- Click any frame's position badge
- Press E with any expanded burst frame selected

## Selection on Expand
- Cursor moves to the **calculated cover** of the burst (first pick → first unflagged → first frame)
- Selection border is visible on that frame

## Selection on Collapse
- Cursor remains on the burst stack (which now represents all frames)

## Visual Indicators on Expanded Frames

Each frame card shows its own state independently:
- Pick/reject flag triangle (top-left corner)
- Star rating overlay (top-right)
- Color label strip (bottom edge)
- Selection border (when selected)
- Position badge (top-right, e.g., "2/6") — doubles as collapse button

## Interaction with Review Mode

- Review mode (content filters active) always flattens bursts to individual frames — this is independent of expand/collapse state
- In review mode, the expand/collapse concept doesn't apply; all images are individual
- The `isReviewMode` check takes priority over `expandedBursts`

## Interaction with Multi-Select

- In expanded state, Shift+click or Cmd+click can select multiple frames within the same burst
- Mutations apply to all selected frames individually (not broadcast to unselected burst frames)

## What This Spec Does NOT Cover

- Animation for expand/collapse transitions (separate concern)
- Loupe behavior within expanded bursts
- Burst detection algorithm
- Burst grouping in the data model
