# ProjectLoupe Interaction Patterns

## Core Principle: Selection → Action → Advance

The photographer's hands never leave the keyboard. Every action is one keystroke,
and context determines scope. Speed is the primary UX metric — Photo Mechanic's
throughput is the bar.

## 1. Context-Aware Scope

The same key does the right thing based on where you are:

| Context | P / X / U scope | Why |
|---------|----------------|-----|
| Grid + single image selected | That image | Direct action |
| Grid + burst selected | All frames in the burst | Burst = one decision unit at grid level |
| Loupe (burst mode) | Current frame only | Loupe is for per-frame scrutiny |
| Loupe (single image) | That image | Same as grid single |

This means a sports photographer can reject an entire 25-frame burst in two
keystrokes from the grid (select → X), or drill into it to cherry-pick the
best 3 frames individually.

## 2. Toggle Over Explicit State

- Pressing the same action twice undoes it: P → pick, P again → unflag
- Reduces cognitive load — no separate "unflag" key needed for quick corrections
- U always unflags regardless (explicit escape hatch)
- Consistent in both grid and loupe

For burst bulk actions, toggle triggers when ALL frames share the same state.
If any frame differs, the action applies uniformly first. This prevents
accidental unflags on partially-culled bursts.

## 3. Smart Cursor

The selection (blue outline) is never lost:

- **After import**: first image auto-selected
- **Closing loupe**: cursor returns to the burst/image you just reviewed
- **Opening loupe on a burst**: starts on first pick > first unflagged > first frame
- **Arrow keys**: always move the cursor predictably through the grid

The cursor is the photographer's "you are here" — losing it breaks flow.

## 4. Progressive Disclosure via Views

```
Grid (overview, triage)
  └── Enter → Loupe (detail, per-frame decisions)
        └── Enter → Compare (future: side-by-side candidates)
              └── ESC → back to Loupe
        └── ESC → back to Grid
  └── ESC → deselect all
```

Each level deeper narrows the scope. Same navigation keys (←→), same action
keys (P/X/U/1-5), tighter context. Muscle memory transfers between levels.

## 5. Keyboard Shortcut Map

### Universal (all views)
| Key | Action |
|-----|--------|
| Cmd+K | Command palette |
| Cmd+Shift+T | Toggle dark/light theme |
| J | Cycle overlay info density |

### Grid View
| Key | Action |
|-----|--------|
| ←→ | Move selection left/right |
| ↑↓ | Move selection up/down (row-aware) |
| Enter | Open loupe for selected item |
| ESC | Deselect all |
| P | Pick (toggle; bulk for bursts) |
| X | Reject (toggle; bulk for bursts) |
| U | Unflag (bulk for bursts) |
| 1-5 | Star rating |
| 6-9 | Color label (red/yellow/green/blue) |

### Loupe View
| Key | Action |
|-----|--------|
| ←→ | Previous/next frame (within burst or all images) |
| ESC | Close loupe, return to grid |
| P | Pick current frame (toggle) |
| X | Reject current frame (toggle) |
| U | Unflag current frame |
| 1-5 | Star rating |
| 6-9 | Color label |

## 6. Applying This Pattern to Future Features

### Compare View
- Enter on multiple picks → compare mode
- ←→ cycles focus between candidates
- P/X on focused image, same toggle behavior
- ESC returns to loupe or grid

### AI Suggestions
- AI proposes picks per burst (highlighted in filmstrip)
- P to accept suggestion, X to override
- Same pattern: keyboard-first, toggle, context-aware

### Export
- Filter grid to picks → visual review
- Enter on any pick → loupe preview
- Export command via Cmd+K palette

### Hardware Controllers (Loupedeck, Stream Deck, etc.)
- Map physical buttons to the same P/X/U/1-5 actions
- Dial maps to ←→ navigation
- Same interaction pattern, different input device
