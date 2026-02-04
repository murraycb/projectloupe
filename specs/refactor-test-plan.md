# ProjectLoupe Data Model Refactor — Test Plan

## Overview
Refactoring the store from dual arrays (`images[]` + `burstGroups[].images[]`) to a normalized model (`Map<string, ImageEntry>` + ID references). This test plan captures every observable behavior to verify nothing regresses.

Test with: `projectloupe/test-raws/` (73 NEFs: 40 Z9A + 33 Z9B, 11 bursts, 3 singles)

---

## 1. Import Pipeline

| # | Test | Expected | Pass |
|---|------|----------|------|
| 1.1 | Cmd+K → "Import Folder" → select `test-raws/` | Import completes, grid populates with burst stacks + singles | ☐ |
| 1.2 | Verify image count in status bar | "73 images" shown | ☐ |
| 1.3 | Verify burst count in status bar | "11 bursts" shown | ☐ |
| 1.4 | Camera headers appear (2 cameras) | Z9A and Z9B sections with correct image counts | ☐ |
| 1.5 | Thumbnails stream in after grid appears | Placeholders → real thumbnails, no flash/flicker | ☐ |
| 1.6 | First image auto-selected after import | Blue outline on first grid item | ☐ |

## 2. Grid — Visual Rendering

| # | Test | Expected | Pass |
|---|------|----------|------|
| 2.1 | Burst cards show stacked appearance | 3-layer stack effect behind thumbnail | ☐ |
| 2.2 | Burst cards show frame count badge | e.g., "12" in top-right pill | ☐ |
| 2.3 | Burst cards show fps + frame info | "Burst · 12 frames · 20.0 fps" below thumbnail | ☐ |
| 2.4 | Single images show as flat cards | No stack, standard thumbnail card | ☐ |
| 2.5 | 3:2 aspect ratio on all thumbnails | Both burst stacks and singles | ☐ |
| 2.6 | Scrollbar always visible | Styled thin scrollbar on right | ☐ |
| 2.7 | Responsive column count | Resize window → columns adjust (min 2, ~216px each) | ☐ |

## 3. Selection

| # | Test | Expected | Pass |
|---|------|----------|------|
| 3.1 | Click single image → selected | Blue border appears | ☐ |
| 3.2 | Click burst card → selected | Blue outline on burst thumbnail | ☐ |
| 3.3 | Click different item → selection moves | Previous deselects, new selects | ☐ |
| 3.4 | ESC in grid → deselect all | No blue outlines, status bar shows 0 selected | ☐ |

## 4. Keyboard Navigation — Grid

| # | Test | Expected | Pass |
|---|------|----------|------|
| 4.1 | → arrow moves to next grid item | Selection advances one item right | ☐ |
| 4.2 | ← arrow moves to previous grid item | Selection moves one item left | ☐ |
| 4.3 | ↓ arrow moves to same column next row | Selection jumps down one row | ☐ |
| 4.4 | ↑ arrow moves to same column prev row | Selection jumps up one row | ☐ |
| 4.5 | ↓ on last row → stays on last row | No crash, selection doesn't disappear | ☐ |
| 4.6 | ↑ on first row → stays on first row | Same | ☐ |
| 4.7 | ↓ to shorter row → clamps to last column | If row has fewer items, selects rightmost | ☐ |
| 4.8 | Bursts treated as single nav items | Arrow right skips over burst, doesn't enter frames | ☐ |
| 4.9 | Arrow nav when nothing selected → selects first | Starting from no selection, any arrow selects first item | ☐ |

## 5. Loupe — Open/Close

| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.1 | Enter on selected burst → loupe opens | Full-screen overlay appears | ☐ |
| 5.2 | Enter on selected single → loupe opens | Same | ☐ |
| 5.3 | Click burst card → loupe opens | Single click opens loupe (not double-click) | ☐ |
| 5.4 | Double-click single card → loupe opens | Double-click opens loupe for singles | ☐ |
| 5.5 | Loupe opens on smart start frame | First pick > first unflagged > first frame | ☐ |
| 5.6 | ESC closes loupe | Returns to grid view | ☐ |
| 5.7 | ESC preserves selection on burst cover | After closing, the burst card is selected in grid | ☐ |

## 6. Loupe — Display

| # | Test | Expected | Pass |
|---|------|----------|------|
| 6.1 | Top bar shows filename | Current image filename | ☐ |
| 6.2 | Top bar shows burst info | "Frame X of Y · Burst · 20.0 fps · 0.6s" | ☐ |
| 6.3 | Top bar shows EXIF | Shutter, aperture, ISO, focal length | ☐ |
| 6.4 | ESC button visible in top-right | Styled button with "ESC" label | ☐ |
| 6.5 | Blurred thumbnail shown while full-res loads | Subtle blur filter on initial load | ☐ |
| 6.6 | Full-res swaps in when ready | Blur disappears, sharp image | ☐ |
| 6.7 | Nav arrows visible at edges | ‹ on left, › on right (not on first/last) | ☐ |

## 7. Loupe — Filmstrip

| # | Test | Expected | Pass |
|---|------|----------|------|
| 7.1 | Filmstrip appears for bursts | Bottom bar with scrollable thumbnails | ☐ |
| 7.2 | Filmstrip thumbnails are 3:2 (90×60px) | Visual check | ☐ |
| 7.3 | Active frame highlighted | Purple/blue outline on current frame | ☐ |
| 7.4 | Active thumb auto-scrolls into view | When navigating, filmstrip follows | ☐ |
| 7.5 | Frame counter on each thumb | Small number in bottom-right | ☐ |
| 7.6 | Click filmstrip thumb → jumps to frame | Image updates, selection follows | ☐ |
| 7.7 | Summary shows flag counts | "3 picks 2 rejects 7 unflagged" in filmstrip bar | ☐ |

## 8. Loupe — Navigation

| # | Test | Expected | Pass |
|---|------|----------|------|
| 8.1 | → arrow advances to next frame in burst | Image + filmstrip update | ☐ |
| 8.2 | ← arrow goes to prev frame in burst | Same, backwards | ☐ |
| 8.3 | → on last frame → stays (no wrap) | Doesn't crash or wrap to first | ☐ |
| 8.4 | ← on first frame → stays | Same | ☐ |
| 8.5 | Click nav arrows works same as keyboard | ‹ › buttons navigate correctly | ☐ |

## 9. Flagging — Loupe

| # | Test | Expected | Pass |
|---|------|----------|------|
| 9.1 | P flags current image as pick | Green "✓ Pick" badge appears on image | ☐ |
| 9.2 | X flags current image as reject | Red "✕ Reject" badge appears | ☐ |
| 9.3 | U unflags current image | Badge disappears | ☐ |
| 9.4 | P on a pick → toggles to unflagged | Toggle behavior (not just set) | ☐ |
| 9.5 | X on a reject → toggles to unflagged | Same toggle behavior | ☐ |
| 9.6 | Filmstrip green corner on picks | Upper-left green triangle on picked thumbs | ☐ |
| 9.7 | Filmstrip red corner on rejects | Upper-left red triangle on rejected thumbs | ☐ |
| 9.8 | Filmstrip rejected thumb dimmed (0.3 opacity) | Rejected thumbs are faded | ☐ |
| 9.9 | Active rejected thumb fully visible (opacity 1) | When viewing a rejected frame, it's not dimmed | ☐ |
| 9.10 | Filmstrip summary updates on flag change | Pick/reject counts change immediately | ☐ |

## 10. Flagging — Grid (Burst-Aware)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 10.1 | X on selected burst → rejects ALL frames | Every frame in burst gets reject flag | ☐ |
| 10.2 | P on selected burst → picks ALL frames | Every frame gets pick flag | ☐ |
| 10.3 | U on selected burst → unflags ALL frames | Every frame cleared | ☐ |
| 10.4 | X on all-picked burst → toggles all to unflag | Since all are same flag, toggle kicks in | ☐ |
| 10.5 | P/X on single image → flags just that image | No burst behavior for non-burst images | ☐ |

## 11. Burst Visual State — Grid

| # | Test | Expected | Pass |
|---|------|----------|------|
| 11.1 | All-rejected burst dims to 0.35 opacity | Visually muted in grid | ☐ |
| 11.2 | All-rejected burst brightens on hover (0.55) | Hover effect still works | ☐ |
| 11.3 | Burst with picks shows green corner flag | Upper-left green triangle on stack | ☐ |
| 11.4 | All-rejected burst shows red corner flag | Upper-left red triangle on stack | ☐ |
| 11.5 | Burst cover = first pick (when picks exist) | Thumbnail updates to show picked frame | ☐ |
| 11.6 | Burst cover = first unflagged (no picks) | When no picks, shows first unflagged | ☐ |
| 11.7 | Burst cover = first frame (all rejected) | Falls back to first image | ☐ |

## 12. Single Image Visual State — Grid

| # | Test | Expected | Pass |
|---|------|----------|------|
| 12.1 | Pick flag shows green corner triangle | Upper-left triangle | ☐ |
| 12.2 | Reject flag shows red corner + diagonal line | Triangle + line overlay at 0.4 opacity | ☐ |
| 12.3 | Rejected single dims to 0.5 opacity | Card fades | ☐ |
| 12.4 | Rejected single hover → 0.8 opacity | Brightens on hover | ☐ |
| 12.5 | Color label shows bottom strip | 3px colored bar at bottom of thumbnail | ☐ |
| 12.6 | Star rating shows in top-right | Gold stars (when overlay ≠ none) | ☐ |

## 13. Ratings & Color Labels

| # | Test | Expected | Pass |
|---|------|----------|------|
| 13.1 | 1-5 keys set rating (grid) | Stars appear on selected image(s) | ☐ |
| 13.2 | 0 clears rating (grid) | Stars disappear | ☐ |
| 13.3 | 1-5 keys set rating (loupe) | Stars appear on loupe view | ☐ |
| 13.4 | 6/7/8/9 set color labels (grid) | Red/yellow/green/blue strip appears | ☐ |
| 13.5 | 6/7/8/9 set color labels (loupe) | Same in loupe | ☐ |
| 13.6 | Loupe shows star rating | Gold stars top-left area | ☐ |

## 14. Overlay Modes

| # | Test | Expected | Pass |
|---|------|----------|------|
| 14.1 | J cycles overlay: none → minimal → standard → full | StatusBar shows current mode | ☐ |
| 14.2 | none: no filename or EXIF below thumbnail | Clean thumbnail only | ☐ |
| 14.3 | minimal: filename only | Filename below thumbnail | ☐ |
| 14.4 | standard: filename + shutter/aperture | Two lines of info | ☐ |
| 14.5 | full: filename + shutter/aperture + ISO/focal | Three lines | ☐ |
| 14.6 | J doesn't fire when loupe is active | Loupe keyboard handler takes precedence | ☐ |

## 15. Filters

| # | Test | Expected | Pass |
|---|------|----------|------|
| 15.1 | Filter by min rating | Only images ≥ rating shown | ☐ |
| 15.2 | Filter by flag (pick/reject/unflagged) | Only matching flags shown | ☐ |
| 15.3 | Filter by color label | Only matching labels shown | ☐ |
| 15.4 | Bursts-only toggle | Only burst images shown, singles hidden | ☐ |
| 15.5 | Combined filters work together | Intersecting filters narrow results | ☐ |
| 15.6 | FilterBar count updates | "X of 73" shown when filtering | ☐ |
| 15.7 | StatusBar count matches | Same filtered count | ☐ |
| 15.8 | "No images match filters" empty state | When filter yields 0 results | ☐ |
| 15.9 | Clear button resets all filters | Returns to full set | ☐ |

## 16. Metadata Panel

| # | Test | Expected | Pass |
|---|------|----------|------|
| 16.1 | No selection → "Select an image" prompt | Empty state message | ☐ |
| 16.2 | Select single image → shows metadata | Camera, lens, exposure, file info | ☐ |
| 16.3 | Select burst image → shows burst section | Group ID + position shown | ☐ |
| 16.4 | Multi-select → "N images selected" | Multi-select message | ☐ |
| 16.5 | Metadata updates when selection changes | Panel reflects current selection | ☐ |

## 17. Command Palette

| # | Test | Expected | Pass |
|---|------|----------|------|
| 17.1 | Cmd+K opens palette | Overlay with search input | ☐ |
| 17.2 | Cmd+K again closes | Toggle behavior | ☐ |
| 17.3 | ESC closes palette | Dismisses without action | ☐ |
| 17.4 | "Import" searchable | Import Folder command found via fuzzy search | ☐ |

## 18. Theme

| # | Test | Expected | Pass |
|---|------|----------|------|
| 18.1 | Cmd+Shift+T toggles dark/light | Full theme swap | ☐ |
| 18.2 | StatusBar shows theme toggle button | ☀/☾ button | ☐ |
| 18.3 | All components respect theme vars | No hardcoded colors breaking in light mode | ☐ |

## 19. Cross-Cutting: State Consistency

These verify the core invariant the refactor addresses — grid and loupe must agree.

| # | Test | Expected | Pass |
|---|------|----------|------|
| 19.1 | Flag in loupe → visible in grid immediately | Open burst, flag frame, ESC → grid reflects flag | ☐ |
| 19.2 | Flag in grid → visible in loupe | Flag burst in grid, Enter → loupe shows flags | ☐ |
| 19.3 | Burst cover updates after flagging in loupe | Pick a non-first frame → burst cover changes to it | ☐ |
| 19.4 | All-rejected dimming after loupe flagging | Reject all frames in loupe → ESC → burst is dimmed | ☐ |
| 19.5 | Filter counts correct after loupe flagging | Flag changes in loupe reflected in FilterBar/StatusBar counts | ☐ |
| 19.6 | Metadata panel correct after loupe nav | Navigate in loupe → metadata shows current image | ☐ |

## 20. Performance Sanity (500-file dataset)

Test with `/Users/tinotran/.openclaw/workspace/raw files/` (500 NEFs)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 20.1 | Import completes in <10s | Grid populates, thumbnails stream | ☐ |
| 20.2 | Rapid P/X flagging feels instant | Flag 10 images quickly, no lag | ☐ |
| 20.3 | Arrow key nav feels instant | Hold arrow key, selection moves smoothly | ☐ |
| 20.4 | Scroll performance smooth | No jank scrolling through full grid | ☐ |

---

## Running the Tests

1. Build: `cd projectloupe && npx tauri dev`
2. Import test-raws via Cmd+K → Import
3. Walk through sections 1-19 in order
4. For section 20, import from `~/workspace/raw files/`
5. Mark each ☐ → ✅ or ❌ with notes

## Pre-Refactor Baseline

Run the full plan BEFORE starting the refactor to confirm all tests pass on current code. Any existing failures get noted and excluded from regression checks.
