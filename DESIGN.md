# SampleScout — Design Contract

Agent-facing visual contract. Product depth: [`briefing/03_VISUAL_DESIGN_SYSTEM.md`](briefing/03_VISUAL_DESIGN_SYSTEM.md). **Live tokens:** [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css).

## Brand

Bright technical field instrument as software — editorial instrument hierarchy with measurement-tool rigor. Calm, precise, high-contrast, monospaced, bright-background first.

Not a dark DAW, generic SaaS dashboard, cyberpunk UI, colorful consumer recorder, retro terminal, or card-heavy mobile kit.

## Product vocabulary and collection identity

- **Capture** is the action. **Collection** is the visible saved-take destination at `/collection` (legacy `/drafts` redirects).
- Group records under **Field Session** headings; internal engineering remains `Session` / `Take`.
- Label existing take details/metadata **Field Notes**; do not imply a separate notes field.
- `Local File` means saved on this device only and only after the OPFS + IndexedDB commit gate.
- **Collect** creates a new Local File from a selected waveform region (shared source; parent intact). Upload ships from Collection only.
- Collection delight is bounded to catalog rhythm, indexing, and compact deterministic specimen marks derived from persisted take/source facts.
- Specimen marks are catalog identities—not waveforms, audio fingerprints, quality scores, rarity, or random decoration. They never replace real waveform data. Active cells use a deterministic neon fill from `--specimen-neon-0`…`--specimen-neon-20` (hashed from the same take/source facts as the mark pattern).

## Tokens (only these)

Use CSS variables from `tokens.css`. Do not invent new hex colors, spacing steps, or font stacks.

| Role     | Token                                                                                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page     | `--paper`                                                                                                                                                                                                                                                                                                                 |
| Panels   | `--surface`, `--surface-subtle`                                                                                                                                                                                                                                                                                           |
| Text     | `--ink`, `--ink-muted`, `--disabled`                                                                                                                                                                                                                                                                                      |
| Rules    | `--line`, `--line-strong`                                                                                                                                                                                                                                                                                                 |
| Signal   | `--signal` — active record, clipping, destructive confirm, critical failure, idle trim boundary markers (not fade grips; active trim drag uses `--brand`), Local File status chips, **and Account auth chip when not connected**                                                                                          |
| Brand    | `--brand` / `--brand-soft` — neon blue-green; primary CTA face (`PrimaryButton`), action-toast border/fill, active waveform selection fill/edges/grips, active trim drag (grip + boundary stroke), Account auth chip when connected, **and Collection upload-status chip queued/uploaded faces** (not record/destructive) |
| Specimen | `--specimen-neon-0`…`--specimen-neon-20` — 21 neon fills for deterministic specimen marks (same family as `--brand`)                                                                                                                                                                                                      |
| Space    | `--space-1`…`--space-7` (4px base), `--page-gutter` (horizontal page inset)                                                                                                                                                                                                                                               |
| Radius   | `--radius-control` (buttons/inputs), `--radius-panel` (panels), `--radius-round` (status/tags/toggles), `--radius-record` (record control face)                                                                                                                                                                           |
| Type     | `--font-mono`, `--text-*` roles (incl. `--text-micro` for compact chips)                                                                                                                                                                                                                                                  |
| Touch    | `--touch-min` (44px)                                                                                                                                                                                                                                                                                                      |

`--radius` is an alias of `--radius-control` for older styles — prefer the named tokens in new code.

## Typography

- Primary: Geist Mono (`--font-mono`). Tabular nums are global — keep them for timers, BPM, levels, sizes.
- **Open, not dense:** body defaults to `--text-body` (16px). Do not shrink type for “technical” density; use spacing for hierarchy instead.
- Section labels: `--text-label`, weight 600, uppercase, tracked.
- Timers: `--text-timer`. Body/meta/button via existing `--text-*`.
- No Inter / Roboto / Arial / system-ui as the primary UI face. No decorative multi-font mixing.

## Layout & surfaces

- Structural panels: flat `--surface`, `1px solid var(--line)`, `--radius-panel`. Prefer pane separation by rules over floating cards.
- Take rows = catalog data records (stable height, baseline alignment) — not marketing or collectible cards. Sequence lives in the display name, not a leading column; the whole row opens the take, with rename in the overflow menu and a visible Discard action (confirm first on Collection). Take lists belong under **Collection**; Capture shows a Collection shortcut (icon + zero-padded **total** count, including `00` when empty, with a **signal** **pending** bubble when upload-pending files exist). No three-tab bottom nav — Collection / Take / Account are stack or overlay surfaces with back / dismiss.
- Mobile outer padding `--page-gutter` (`--space-3`); desktop `--space-5`; major section gap `--space-5`; list row gap `--space-3` (prefer air over packing).
- Respect `env(safe-area-inset-*)`. Desktop: 1px pane rules, not drop shadows.

## Controls

| Kind      | Treatment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary   | Recessed well + raised `--brand` face, `--ink` label (`PrimaryButton`); min-height `--touch-min`. Use for take **Collect**, Collection footer **Upload**, upload-sheet confirm **Upload**, and other main commit CTAs. **Only Primary, Record, and Playback use 3D well/face chrome.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Ghost     | **BackButton look is the Ghost style** — flat transparent idle; hover = `--surface-subtle` well + `--surface` face; pressed = root/well/face all `--surface` (no inset shadows). Designed to sit on `--paper` (top bars, sheet headers) so the `--surface` face reads; do not place on `--surface` or hover/press vanish. `GhostButton` is the single chrome source; `BackButton` is a thin `GhostButton` link wrapper (`icon` + `href` + back glyph). Optional `compact` (~30px) for waveform toolbar; `danger` = same ghost with `--signal` label/icon only. Use for Back, nav chrome (Account, Collection shortcut, Loop), Collection **Select** (text) / **Import** + **Cleanup** (icons) / select-mode actions, take-editor **Reset**, **Field Notes**, sheet close, cancel, and destructive confirm labels. |
| Record    | solid `--signal` rounded square (`--radius-record`) in recessed well (idle) + `Record`; recording: dark `--ink` face + `--signal` stop square + `Stop`; timer visible while active. **3D well/face chrome.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Playback  | Smaller Record-style control for take transport (`PlaybackControl`): recessed well + dark `--ink` rounded-square face + `--brand` play/pause glyph (icon-only; no label under the control). Centered under the overview scrubber; Loop sits in the right column (Capture-style `1fr auto 1fr` band). Not `--signal` (not record/destructive). **3D well/face chrome.**                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Idle plot | Capture stage above the record band shows a standby frame (zero axis, edge ticks, `STANDBY` in timer header slot, slow right→left scan) sharing live-wave geometry — not a decorative or fake waveform; scan off under `prefers-reduced-motion`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Reuse `$lib/ui` components (`PrimaryButton`, `GhostButton`, `BackButton`, `RecordControl`, `PlaybackControl`, `StatusLabel`, `UploadStatusChip`, `EmptyState`, `TakeRow`, `CaptureTimer`, `InputMeter`, `ActionToast`) before inventing new chrome. UI glyphs use `$lib/ui/icons` (`Icon`) — do not paste one-off Material paths into routes.

### Collection upload status chip

`UploadStatusChip` on Collection `TakeRow` only (not take Status / upload sheet). One persistent pill morphs between faces with smooth width + color transitions (respect `prefers-reduced-motion`):

| Face       | Treatment                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Local file | `--signal` outline + label (unchanged Local File read)                                                                                        |
| Queued     | armed — `--brand` border + `--brand-soft` fill + label; soft breathe (not celebratory)                                                        |
| Busy       | render / encode / upload / process — spinner only, no label (phase detail stays in the upload sheet); `aria-label` carries the concrete phase |
| Uploaded   | stays forever — subtle `--brand-soft` fill + check glyph (not loud green)                                                                     |
| Failed     | prominent `--signal` fill + Failed label                                                                                                      |

### Icons

UI glyphs live in `$lib/assets/ui-icons/*.svg` and render through `$lib/ui/icons` (`Icon`). Names: back, account, collection, trash, reset, field-notes, import, cleanup, loop, zoom-in, zoom-out, close, check, play, pause, stop, record. Paths use `currentColor`. Specimen marks stay generated catalog identity — not part of this set. Logo / PWA assets stay separate. Do not paste one-off icon paths into routes.

### Action toasts

Compact, content-width feedback chips: `--brand-soft` fill, `--brand` border, `--text-annotation` type (ink). No leading accent bar; do not use `--signal` for success / confirm feedback. Optional action uses a small brand-outlined control on `--surface`. Not full-width panels. Centered in the viewport (horizontally and vertically). Stack above sheets/confirms (`toast-host` z-index above SheetOverlay / ConfirmDialog) so outcomes stay readable while a sheet is open. Enter/exit: global slide + fade + scale with rubber overshoot (back easing; ~480ms in / ~400ms out; respect `prefers-reduced-motion`).

## Motion

State communication only (record transition, take insert, upload/progress, Collection upload-status chip morph, short stack navigations, compact action toasts). Stack pages may use a brief directional slide+fade (forward deeper, back shallower) via the View Transitions API — not decorative. Action toasts use a brief rubber overshoot (slide-up past rest on enter; inverse pull then settle-out on exit) — not celebratory Collection motion. No springy cards, or pulsing everything while recording. Honor `prefers-reduced-motion` (skip page slides, toast motion, chip width/spin/breathe, and idle scan).

**Exception — Capture standby scan:** while Capture is idle, the standby plot may run one slow right→left scan marker on the zero axis (same scroll direction as the live wave; instrument “armed” read). Meters header space matches the Capture timer so the zero axis aligns with recording. No fake waveform motion, no `--signal`/`--brand`, pause when the document is hidden, and disable entirely under `prefers-reduced-motion`.

## Accessibility

- WCAG AA contrast; visible `:focus-visible` (global ink outline exists — keep it).
- State text in addition to color (`REC`, `SAVED`, `FAILED`, etc.).
- Icons need text for important actions. Do not disable zoom. Essential text is not thin gray-only.

## Waveforms

Accurate PCM-derived peaks only. Canvas + DPR. Clear zero axis and time ruler. Never decorative placeholders, mirrored blobs, EQ bars, or fake paths after audio is loaded. Trim boundary strokes and DOM grips use `--signal` when idle (block tabs below the wave) and stay visible even when retained bounds match the full take; **while dragging a trim edge**, that grip tab and its canvas boundary stroke use `--brand` (same as action toasts / selection), and fade grips soften to 40% transparent. Selection uses `--brand-soft` fill and `--brand` edges/grips (distinct from idle signal trim). Fade grips use `--ink` wedge tabs on the bottom edge of the time ruler (ruler includes bottom pad for them); fade envelopes are dashed `--ink` diagonals (not signal). Fades scale drawn peak amplitude by the linear fade gain. Discarded (outside trim) regions on the main waveform and overview use a `--disabled` wash with `--disabled` peaks so off material reads as excluded from upload; retained audio stays normal `--ink` on paper. Details: [`briefing/04_WAVEFORM_AND_AUDIO_EDITOR.md`](briefing/04_WAVEFORM_AND_AUDIO_EDITOR.md) and `.cursor/rules/waveform-ui.mdc`.

## Anti-patterns (do not)

- Dark-first themes, purple/indigo gradients, glow stacks, glassmorphism
- Warm cream + terracotta + display serif defaults; broadsheet newspaper layouts
- Card grids, decorative pill clusters, stat strips, floating badges on media (interactive session-name suggestion chips on Capture are allowed; use `--radius-round`)
- Hardcoded `#hex` / `rgb()` / arbitrary `px` spacing outside tokens
- Oversized decorative record rings; emoji as UI chrome
- Inventing a second type scale or color palette in a component
- Rarity, XP, streaks, collectible-card framing, or cloud/sync implications
