# SampleScout — Design Contract

Agent-facing visual contract. Product depth: [`briefing/03_VISUAL_DESIGN_SYSTEM.md`](briefing/03_VISUAL_DESIGN_SYSTEM.md). **Live tokens:** [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css).

## Brand

Bright technical field instrument as software — editorial instrument hierarchy with measurement-tool rigor. Calm, precise, high-contrast, monospaced, bright-background first.

Not a dark DAW, generic SaaS dashboard, cyberpunk UI, colorful consumer recorder, retro terminal, or card-heavy mobile kit.

## Product vocabulary and collection identity

- **Capture** is the action. **Collection** is the visible saved-take destination; keep route `/drafts`.
- Group records under **Field Session** headings; internal engineering remains `Session` / `Take`.
- Label existing take details/metadata **Field Notes**; do not imply a separate notes field.
- `Local Draft` means saved on this device only and only after the OPFS + IndexedDB commit gate.
- Collection delight is bounded to catalog rhythm, indexing, and compact deterministic specimen marks derived from persisted take/source facts.
- Specimen marks are catalog identities—not waveforms, audio fingerprints, quality scores, rarity, or random decoration. They never replace real waveform data.

## Tokens (only these)

Use CSS variables from `tokens.css`. Do not invent new hex colors, spacing steps, or font stacks.

| Role   | Token                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------ |
| Page   | `--paper`                                                                                              |
| Panels | `--surface`, `--surface-subtle`                                                                        |
| Text   | `--ink`, `--ink-muted`, `--disabled`                                                                   |
| Rules  | `--line`, `--line-strong`                                                                              |
| Signal | `--signal` — active record, clipping, destructive confirm, critical failure, **and trim boundary markers** (not fade grips) |
| Brand  | `--brand` / `--brand-soft` — neon blue-green; action-toast border/fill only (not record/destructive) |
| Space  | `--space-1`…`--space-7` (4px base)                                                                     |
| Radius | `--radius-control` (buttons/inputs), `--radius-panel` (panels), `--radius-round` (status/tags/toggles) |
| Type   | `--font-mono`, `--text-*` roles                                                                        |
| Touch  | `--touch-min` (44px)                                                                                   |

`--radius` is an alias of `--radius-control` for older styles — prefer the named tokens in new code.

## Typography

- Primary: Geist Mono (`--font-mono`). Tabular nums are global — keep them for timers, BPM, levels, sizes.
- **Open, not dense:** body defaults to `--text-body` (16px). Do not shrink type for “technical” density; use spacing for hierarchy instead.
- Section labels: `--text-label`, weight 600, uppercase, tracked.
- Timers: `--text-timer`. Body/meta/button via existing `--text-*`.
- No Inter / Roboto / Arial / system-ui as the primary UI face. No decorative multi-font mixing.

## Layout & surfaces

- Structural panels: flat `--surface`, `1px solid var(--line)`, `--radius-panel`. Prefer pane separation by rules over floating cards.
- Take rows = catalog data records (stable height, baseline alignment) — not marketing or collectible cards. Sequence lives in the display name, not a leading column; the whole row opens the take, with rename in the overflow menu and a visible Discard action (confirm first on Collection). Take lists belong under **Collection**; Capture shows a Collection shortcut (icon + pending count, or Collection label when empty). No three-tab bottom nav — Collection / Take / Account are stack or overlay surfaces with back / dismiss.
- Mobile outer padding `--space-4`; major section gap `--space-5`; list row gap `--space-3` (prefer air over packing).
- Respect `env(safe-area-inset-*)`. Desktop: 1px pane rules, not drop shadows.

## Controls

| Kind        | Treatment                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Primary     | `--ink` fill, `--surface` text, 1px ink border, min-height `--touch-min`                                    |
| Secondary   | surface/transparent fill, ink border + text                                                                 |
| Destructive | surface fill, `--signal` border/text; filled signal only on confirm / active destructive                    |
| Record      | solid `--signal` circle in recessed well (idle) + `Record`; recording: dark `--ink` face + `--signal` stop square + `Stop`; timer visible while active |

Reuse `$lib/ui` components (`RecordControl`, `StatusLabel`, `EmptyState`, `TakeRow`, `CaptureTimer`, `InputMeter`, `ActionToast`) before inventing new chrome.

### Action toasts

Compact, content-width feedback chips: `--brand-soft` fill, `--brand` border, `--text-annotation` type (ink). No leading accent bar; do not use `--signal` for success / confirm feedback. Optional action uses a small brand-outlined control on `--surface`. Not full-width panels. Centered in the viewport (horizontally and vertically). Enter/exit: global slide + fade + scale with rubber overshoot (back easing; ~480ms in / ~400ms out; respect `prefers-reduced-motion`).

## Motion

State communication only (record transition, take insert, upload/progress, short stack navigations, compact action toasts). Stack pages may use a brief directional slide+fade (forward deeper, back shallower) via the View Transitions API — not decorative. Action toasts use a brief rubber overshoot (slide-up past rest on enter; inverse pull then settle-out on exit) — not celebratory Collection motion. No springy cards, ambient loops, or pulsing everything while recording. Honor `prefers-reduced-motion` (skip page slides and toast motion).

## Accessibility

- WCAG AA contrast; visible `:focus-visible` (global ink outline exists — keep it).
- State text in addition to color (`REC`, `SAVED`, `FAILED`, etc.).
- Icons need text for important actions. Do not disable zoom. Essential text is not thin gray-only.

## Waveforms

Accurate PCM-derived peaks only. Canvas + DPR. Clear zero axis and time ruler. Never decorative placeholders, mirrored blobs, EQ bars, or fake paths after audio is loaded. Trim boundary strokes and DOM grips use `--signal` (block tabs below the wave) and stay visible even when retained bounds match the full take. Fade grips use `--ink` wedge tabs on the bottom edge of the time ruler (ruler includes bottom pad for them); fade envelopes are dashed `--ink` diagonals (not signal). Fades scale drawn peak amplitude by the linear fade gain. Discarded (outside trim) regions on the main waveform and overview use a `--disabled` wash with `--disabled` peaks so off material reads as excluded from upload; retained audio stays normal `--ink` on paper. Details: [`briefing/04_WAVEFORM_AND_AUDIO_EDITOR.md`](briefing/04_WAVEFORM_AND_AUDIO_EDITOR.md) and `.cursor/rules/waveform-ui.mdc`.

## Anti-patterns (do not)

- Dark-first themes, purple/indigo gradients, glow stacks, glassmorphism
- Warm cream + terracotta + display serif defaults; broadsheet newspaper layouts
- Card grids, pill clusters, stat strips, floating badges on media
- Hardcoded `#hex` / `rgb()` / arbitrary `px` spacing outside tokens
- Oversized decorative record rings; emoji as UI chrome
- Inventing a second type scale or color palette in a component
- Rarity, XP, streaks, collectible-card framing, or cloud/sync implications
