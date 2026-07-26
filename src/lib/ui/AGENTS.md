# UI components — agent notes

Read [`DESIGN.md`](../../../DESIGN.md) before adding or restyling UI.

## Prefer existing components

| Component                        | Use for                                               |
| -------------------------------- | ----------------------------------------------------- |
| `AppShell` / `AccountOverlay`    | Brand bar (Capture) + Account sheet/modal; no tab bar |
| `SheetOverlay` / `ConfirmDialog` | Shared sheet-modal chrome; destructive confirm dialog |
| `RecordControl`                  | Record / stop                                         |
| `CaptureTimer`                   | Elapsed / remaining / warnings                        |
| `LiveWaveform`                   | Live scrolling capture wave (min/max)                 |
| `InputMeter`                     | Input level + clip                                    |
| `StatusLabel`                    | Compact state chips (text + tone)                     |
| `EmptyState`                     | Empty lists / unloaded editor                         |
| `TakeRow`                        | Take list records                                     |
| `ActionToast`                    | Compact ephemeral action feedback                     |
| `AuthSplash`                     | Unsigned-in gate (logo + Connect)                     |

Put audio/persistence logic in `$lib/audio`, `$lib/persistence`, `$lib/state` — keep these components presentational.

## Local rules

- Tokens only (`var(--…)` from `tokens.css`)
- Panels → `--radius-panel`; buttons/inputs → `--radius-control`; status → `--radius-round`
- No new color palettes, shadows, or card frameworks
- Match bright mono instrument look; `--signal` sparingly

Waveform/editor work: also follow `.cursor/rules/waveform-ui.mdc`.
