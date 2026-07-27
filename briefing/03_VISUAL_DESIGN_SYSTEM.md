# Visual Design System

## 1. Direction

SampleScout should look like a **bright technical field instrument rendered as software**.

The visual identity is:

- Minimal
- Monochrome
- Precise
- Instrument-like
- Calm
- High contrast
- Grid-based
- Primarily monospaced
- Bright-background first

It should not resemble:

- A generic SaaS dashboard
- A dark DAW
- A cyberpunk interface
- A colorful consumer recording app
- A retro terminal
- An imitation of physical hardware
- A card-heavy mobile design system

## 2. Visual concept

Use the visual language of:

- Measurement tools
- Signal plots
- Scientific cataloging
- Technical manuals
- Field notes
- Audio meters
- Coordinate grids
- Precise labels
- Printed instrument markings

The interface should communicate trust through alignment, truthful data, and stable controls.

Collection identity should add bounded delight through scientific catalog rhythm: stable Field Session headings, indexed take records, measured whitespace, and deterministic specimen marks. It must not become a collectible-card system.

## 3. Color system

### Core palette

```css
--paper: #f0f0ec;
--surface: #ffffff;
--surface-subtle: #efefeb;
--ink: #111111;
--ink-muted: #5c5c58;
--line: #c9c9c3;
--line-strong: #85857f;
--disabled: #a8a8a2;
```

The background should be off-white rather than pure white to reduce glare.

### Signal color

Use one optional functional signal color.

Recommended:

```css
--signal: #ff1f2e;
--brand: #00f0c8;
--brand-soft: #c8fff2;
```

Use `--signal` only for:

- Active recording
- Clipping
- Destructive confirmation
- Critical failure
- Trim / edit boundary markers on the waveform
- Local File status chips (Collection take rows and take Status) — same record red, border + text

Use `--brand` / `--brand-soft` for primary CTA faces (`PrimaryButton`: Collect / Upload), compact action-toast chrome (success / confirm feedback), **and** active waveform selection fill/edges/grips. While dragging a trim edge, that grip and its boundary stroke also use `--brand` (idle trim stays `--signal`). Do not use `--signal` for those toasts, primary CTAs, or selection. Discarded (outside-trim) waveform regions use `--disabled` wash and peaks; retained audio stays normal `--ink` on paper.

Do not use signal or brand color for ordinary navigation or decoration (Account / Collection / Loop wells stay surface-faced; brand appears only as the latched LED or primary CTA face).

Alternative: provide a fully monochrome mode using fill, border weight, pattern, and text labels instead of signal color.

### State differentiation

States must not rely only on color.

Examples:

- `REC ●`
- `SAVED ✓`
- `UPLOAD ↑ 42%`
- `PROCESSING …`
- `FAILED !`

## 4. Typography

### Primary font

**Chosen:** Geist Mono (self-hosted via `@fontsource/geist-mono`).

Use a web-available monospaced font with strong numeric legibility.

Recommended order (fallbacks / alternatives):

1. Geist Mono ← **in use**
2. IBM Plex Mono
3. Commit Mono
4. JetBrains Mono
5. Source Code Pro

A local/system fallback stack is required.

Example:

```css
font-family: 'Geist Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
```

### Secondary font

A neutral sans-serif may be used sparingly for longer help text.

Recommended:

```css
font-family: Inter, system-ui, sans-serif;
```

Do not mix typefaces for decorative effect.

### Typographic roles

UI should feel open and readable on mobile — not dense or instrument-cramped.

| Role                 | Token / live size           | Style                    |
| -------------------- | --------------------------- | ------------------------ |
| App title            | `--text-title` · 24 px      | 600                      |
| Screen title         | `--text-screen` · 22 px     | 600                      |
| Primary timer        | `--text-timer` · 48 px      | 500–600, tabular numbers |
| Section label        | `--text-label` · 13 px      | 600, uppercase           |
| Body                 | `--text-body` · 16 px       | 400                      |
| Metadata             | `--text-meta` · 14 px       | 400                      |
| Technical annotation | `--text-annotation` · 13 px | 400                      |
| Button               | `--text-button` · 15 px     | 600                      |

Use `font-variant-numeric: tabular-nums` for time, BPM, sizes, and levels.

Do not drop below these sizes for a “technical” look. Precision is not the same as illegibility.

## 5. Grid and spacing

Use a 4 px base unit.

Suggested tokens:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
```

### Mobile

- Outer padding: 12 px (`--page-gutter` / `--space-3`)
- List gap: 12 px (prefer air over packing)
- Major section gap: 24 px
- Fixed control safe-area padding: `env(safe-area-inset-bottom)`

### Desktop

- Pane padding: 16–24 px; page gutter: 24 px (`--page-gutter` / `--space-5`)
- Pane separation: 1 px rule
- Avoid floating cards where a structural panel is clearer

## 6. Surfaces and borders

Prefer:

- Flat surfaces
- 1 px rules
- Rare 2 px emphasis
- Small radii
- No drop shadows by default

Suggested radii:

```css
--radius-control: 4px;
--radius-panel: 6px;
--radius-round: 999px;
```

Use large pill shapes only for toggles, tags, or status where the shape has semantic value.

## 7. Buttons

### Primary

- Recessed well (`--surface-subtle` + inset depth) with a raised `--brand` face and `--ink` label
- Clear hover (lighter well + slightly lifted brand face) and pressed (deeper well + darkened brand face) states
- Minimum 44 px mobile height (`--touch-min`)
- **Only Primary and Record use 3D well/face chrome**
- Use `PrimaryButton` for take **Collect**, Collection footer **Upload**, upload-sheet confirm **Upload**, and other main commit CTAs

### Ghost

- Idle: transparent fill, no border, ink text/icon (nav chrome may use muted ink)
- Hover / sticky on / press: flat `--surface-subtle` well + `--surface` face (no inset shadows)
- `:active` (while pressed): `--brand` for text/icon fill; destructive ghosts keep `--signal`
- Optional `compact` (~30px) for waveform toolbar; optional brand **live** LED for connected Account / latched Loop
- Use `GhostButton` / `BackButton` for Back, Account, Collection shortcut, Loop, Collection **Select** / **Import** / select-mode actions, take-editor **Reset** / **Play** / **Field Notes**, sheet close, cancel, and destructive confirm labels
- Collection **Upload** and take **Collect** use **Primary**, not Ghost

### Destructive

- Same ghost treatment with `--signal` label/icon only (no filled signal button chrome)

### Record

The record control must be visually unmistakable — a solid red rounded-square control (large corner radius, not a pure circle), seated in a shallow recessed well.

Idle:

- Filled `--signal` rounded square (thumb-sized, `--radius-record`) inside a soft `--surface-subtle` well with quiet inset depth and matching concentric corners
- Label `RECORD` below the control

Active:

- Same rounded-square footprint with a dark `--ink` face (still in the recessed well)
- `--signal` rounded stop square (signal on the icon only — not the whole button fill)
- Label `STOP`
- Timer visible

Avoid oversized decorative rings, pulsing halos, glowing effects, and floating drop shadows. Soft inset depth for the well is allowed.

## 8. Iconography

Use the shared SampleScout UI set: SVG files in `$lib/assets/ui-icons`, rendered via `$lib/ui/icons` (`Icon`). Do not mix Material fills, emoji, or ad-hoc path dumps into screens.

Rules:

- 24×24 viewBox assets with `currentColor` stroke/fill
- Swap artwork by replacing the SVG file — keep the `Icon` name stable
- Icons accompanied by text for important actions when a label is clearer (Play, Upload, Normalize…)
- No mixed icon families
- Avoid metaphorical icons when a text label is clearer
- Specimen marks remain generated catalog identity — not UI glyphs
- Brand / PWA mark assets stay separate from chrome icons

The SampleScout mark may combine:

- Precise waveform
- Crosshair
- Compass tick
- Sample marker

Avoid a generic location pin as the primary identity unless it is substantially differentiated.

### Specimen marks

A Collection record may carry a small deterministic specimen mark derived from persisted take/source facts. The same inputs must produce the same mark (pattern and neon fill); no random-on-render decoration. Marks are catalog identities only—not waveforms, audio fingerprints, signal analysis, quality scores, rarity, or status.

Keep marks compact and subordinate to the record name. Active cells use one of 21 neon fills (`--specimen-neon-0`…`--specimen-neon-20`, same family as brand success teal) chosen deterministically from the mark hash. They must never resemble a fake waveform or replace the real PCM-derived waveform.

## 9. Panels and lists

Use structural panels, not a collection of floating cards.

The visible destination is **Collection** (route `/collection`), grouped by **Field Session**. Use **Field Notes** for the existing take details/metadata region. These labels do not change the internal `Session`/`Take` model.

Take rows should resemble data records:

```text
[PLAY] Session — 004 / Door latch    00:18    one-shot    UNREVIEWED    ⋯
```

Sequence lives in the display name — no leading sequence column. The whole row is clickable to open the take; rename lives in the overflow menu; Discard is a visible per-row action with confirmation on Collection.

Use:

- Baseline alignment
- Vertical rules
- Stable row height
- Clear selected / hover state
- Overflow menu for secondary actions

On mobile, allow an expanded latest-take region without changing the order or moving the main record control.

## 10. Waveform visual rules

Waveforms must look like measured audio data.

Required:

- Actual audio-derived peaks
- Fine detail appropriate to zoom
- Clear zero axis
- Accurate time ruler
- Crisp high-DPI rendering
- Selection and edit boundaries aligned to time
- No generic decorative waveform asset
- No random waveform placeholder after audio has loaded
- No exaggerated smoothing
- No uniform mirrored “blob”
- No substitution with equalizer bars

Overview waveforms may use min/max peak envelopes but must preserve real transients.

Detailed rules are in `04_WAVEFORM_AND_AUDIO_EDITOR.md`.

## 11. Motion

Motion should communicate state, not decorate.

Allowed:

- Recording-state transition
- Take saved insertion
- Undo restoration
- Upload progress
- Processing indicator
- Panel reveal
- Selection movement
- Capture idle standby scan — one slow right→left marker on the zero axis (matches live-wave scroll; instrument “armed”), not a fake waveform; header slot matches timer height so the axis aligns with recording; pause when hidden; off under `prefers-reduced-motion`

Avoid:

- Springy card animations
- Open-ended ambient decoration (glow pulses, floating particles, looping marketing motion)
- Pulsing everything during recording
- Waveform animation unrelated to actual input (standby scan is axis/cursor only)
- Celebratory collection motion, rarity reveals, XP, or streak effects

Respect `prefers-reduced-motion`.

## 12. Accessibility

- WCAG AA contrast minimum
- Visible focus ring
- All controls keyboard accessible on desktop
- Labels in addition to icons
- State text in addition to color
- 44 px mobile touch targets
- Do not disable browser zoom
- Support 200% zoom
- Precise waveform selection must also be adjustable using numeric inputs or keyboard nudges
- Do not use thin gray text for essential information

## 13. Three design variants within one system

The implementation should use one coherent system, but visual prototypes may explore:

### A. Digital measurement

- Tight grid
- Compact density
- More numeric readouts
- Oscilloscope and analyzer references

### B. Technical field guide

- More whitespace
- Small line diagrams
- Session/take indexing like specimens
- Restrained annotations

### C. Editorial instrument

- Strong typographic hierarchy
- Large precise plots
- Fewer visible controls at once
- Technical magazine or standards-document feel

The recommended final synthesis is **C with the interaction rigor of A**.
