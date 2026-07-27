# UI components — agent notes

Read [`DESIGN.md`](../../../DESIGN.md) before adding or restyling UI.

## Prefer existing components

| Component                        | Use for                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell` / `AccountOverlay`    | Brand bar (Capture) + Account sheet/modal; no tab bar                                                                                                    |
| `SheetOverlay` / `ConfirmDialog` | Shared sheet-modal chrome; destructive confirm dialog                                                                                                    |
| `BatchUploadPanel`               | Collection upload confirm→progress (sheet body)                                                                                                          |
| `PrimaryButton`                  | Brand-well primary CTAs (Collect, Collection Upload)                                                                                                     |
| `GhostButton` / `BackButton`     | Flat ghost actions (BackButton look = Ghost chrome); `BackButton` = GhostButton link wrapper; `compact` for toolbar; `danger` for destructive label/icon |
| `RecordControl`                  | Record / stop                                                                                                                                            |
| `PlaybackControl`                | Take play / pause (smaller Record-style well)                                                                                                            |
| `CaptureTimer`                   | Elapsed / remaining / warnings                                                                                                                           |
| `LiveWaveform`                   | Live scrolling capture wave (min/max)                                                                                                                    |
| `StandbyPlot`                    | Idle Capture plot (axis / ticks / STANDBY / scan)                                                                                                        |
| `InputMeter`                     | Input level + clip                                                                                                                                       |
| `StatusLabel`                    | Compact state chips (text + tone)                                                                                                                        |
| `UploadStatusChip`               | Collection take-row upload face morph (Local / Queued / Busy spinner / Uploaded / Failed)                                                                |
| `EmptyState`                     | Empty lists / unloaded editor                                                                                                                            |
| `TakeRow`                        | Take list records (uses `UploadStatusChip` for upload state)                                                                                             |
| `SessionNameSheet`               | Capture session rename sheet (input + user/built-in chips + Done)                                                                                        |
| `ActionToast`                    | Compact ephemeral action feedback                                                                                                                        |
| `AuthSplash`                     | Unsigned-in gate (logo + Connect)                                                                                                                        |
| `BusyIndicator`                  | Compact loading dots (temporary states)                                                                                                                  |
| `Icon` (`$lib/ui/icons`)         | Shared UI glyphs (stroke set + play/pause/stop)                                                                                                          |

Put audio/persistence logic in `$lib/audio`, `$lib/persistence`, `$lib/state` — keep these components presentational.

## Local rules

- Tokens only (`var(--…)` from `tokens.css`)
- Panels → `--radius-panel`; buttons/inputs → `--radius-control`; status → `--radius-round`; record face → `--radius-record`
- Brand primary CTAs use `PrimaryButton` (recessed well + `--brand` face; Collect, Collection Upload)
- Ghost actions use `GhostButton` (single chrome source; BackButton look = Ghost style). Sit Ghost on `--paper` so `--surface` hover/press faces read (sheet headers use `--paper` for this). `BackButton` wraps `GhostButton` as an icon link — do not duplicate well/face CSS. Only Primary, Record, and Playback get 3D well/face
- No new color palettes, shadows, or card frameworks
- Match bright mono instrument look; `--signal` sparingly
- UI icons: import `{ Icon }` from `$lib/ui/icons` — do not inline one-off SVG paths in routes

Waveform/editor work: also follow `.cursor/rules/waveform-ui.mdc`.
