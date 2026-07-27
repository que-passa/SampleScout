---

## Collection identity addendum

This concatenated reference uses some legacy visible labels. Apply these decisions throughout:

- **Capture** is the action; **Collection** is the visible destination at `/collection`.
- **Field Session** is the UI grouping label; keep internal `Session` / `CaptureSession` / `Take` terminology.
- **Field Notes** labels the existing take metadata/details surface; do not add a persisted notes field.
- **Local File** means saved on this device only and may appear only after both the OPFS source write and IndexedDB metadata commit succeed.
- **Collect** creates a new Local File from the retained trim of an existing take (shared source; parent intact). Typical field path: longer multi-sound capture → Trim → Collect repeatedly → upload from Collection. See ADR 0003 and the individual briefing files.
- Upload pending excludes parents that have collected children; lone takes remain pending.
- Display names use short stem + two-digit numbers; never em/en dashes.
- Collection delight is limited to catalog rhythm, indexing, and deterministic specimen marks derived from persisted take/source facts.
- Specimen marks are not waveforms, audio fingerprints, quality scores, rarity, or random decorative waveform. Real PCM-derived waveform rules remain unchanged.
- Do not add XP, streaks, collectible cards, celebratory motion, or cloud/sync implications.

The individual files in this directory are authoritative when this snapshot contains older wording or status.

# Source file: `00_README.md`

# SampleScout — Cursor Briefing Pack

**Status:** Product and design concept  
**Date:** 2026-07-25  
**Target:** Browser-based, mobile-first PWA hosted on GitHub Pages  
**Frontend:** Latest stable Svelte + SvelteKit at implementation time  
**Backend:** None

## Purpose

This package is the source-of-truth briefing for designing and building **SampleScout** in Cursor.

SampleScout is a focused browser application that lets an Audiotool user:

1. Record multiple short audio takes on a phone.
2. Keep each completed take locally for later.
3. Immediately record another unrelated take.
4. Retake, overwrite, or discard individual takes.
5. Perform lightweight, non-destructive editing.
6. Review mostly prefilled metadata.
7. Upload WAV, MP3, or another Audiotool-supported format directly to Audiotool.

It is not a mobile DAW and it is not a permanent cloud-storage service.

## Documents

| File | Purpose |
|---|---|
| `01_PRODUCT_CONCEPT.md` | Product definition, principles, scope, limitations |
| `02_UX_INFORMATION_ARCHITECTURE.md` | Navigation, flows, responsive behavior, screen requirements |
| `03_VISUAL_DESIGN_SYSTEM.md` | Bright monochrome technical style and component rules |
| `04_WAVEFORM_AND_AUDIO_EDITOR.md` | Precise waveform rendering and editor interaction specification |
| `05_TECHNICAL_ARCHITECTURE.md` | Browser-only Svelte architecture, audio, storage, Audiotool integration |
| `06_DATA_MODEL_AND_STATES.md` | Suggested TypeScript domain model and state machines |
| `07_MVP_ACCEPTANCE_CRITERIA.md` | MVP scope, acceptance criteria, validation gates |
| `08_CURSOR_BUILD_BRIEF.md` | Copy-ready implementation instruction for Cursor |
| `09_GITHUB_PAGES_DEPLOYMENT.md` | Static deployment, base paths, OAuth redirects, PWA constraints |
| `10_RESEARCH_AND_OPEN_RISKS.md` | Verified facts, unresolved API questions, backend-required features |

## Reading order for implementation

1. Read `01_PRODUCT_CONCEPT.md`.
2. Read `03_VISUAL_DESIGN_SYSTEM.md` and `04_WAVEFORM_AND_AUDIO_EDITOR.md`.
3. Read `05_TECHNICAL_ARCHITECTURE.md` and `06_DATA_MODEL_AND_STATES.md`.
4. Use `08_CURSOR_BUILD_BRIEF.md` as the active build prompt.
5. Validate the gates in `07_MVP_ACCEPTANCE_CRITERIA.md` before expanding scope.

## Non-negotiable decisions

- Bright background, not a dark-first interface.
- Predominantly black, white, and neutral gray.
- Monospaced typography is central to the identity.
- Technical and precise, but not visually dense for its own sake.
- Waveforms must be derived accurately from the audio data.
- Unlisted is the default Audiotool visibility.
- One-shot is the default sample kind.
- Every stopped take is saved locally before the workflow continues.
- No custom backend will be built.
- GitHub Pages is the intended production host.
- Browser limitations must be exposed honestly instead of hidden.

## Working product statement

> SampleScout is a capture-first, local-first Audiotool sample companion for recording several sounds quickly, keeping them as local files, applying precise lightweight edits, accepting useful metadata defaults, and uploading directly to Audiotool.


---

# Source file: `01_PRODUCT_CONCEPT.md`

# Product Concept

## 1. Product definition

**SampleScout** is a responsive web app and installable PWA for capturing real-world audio and sending prepared samples to Audiotool.

The primary use case is a person walking around with a phone and making several short recordings over a few minutes. The recordings may be unrelated. The user must be able to stop one take, leave it untouched, and begin another take immediately.

The product supports:

- Mobile microphone recording
- Multiple independent takes
- Local files
- Immediate retake or discard
- File import
- Trim, cut, fade, and normalization
- Metadata defaults and batch editing
- WAV and MP3 output
- Direct Audiotool authentication and upload

The product does not attempt to replace a DAW.

## 2. Core user problem

Recording a useful sample on a phone is easy. Moving it into a music-production workflow with meaningful metadata and light cleanup is unnecessarily fragmented.

The current friction usually includes some combination of:

- Recording in a generic voice recorder
- Finding and exporting the file
- Moving it to another device
- Trimming or converting it elsewhere
- Renaming it
- Adding tags and sample type
- Uploading it separately

SampleScout compresses this into one capture-first workflow.

## 3. Product principles

### 3.1 Capture is always the primary action

The user must not be forced through naming, editing, or metadata after every recording.

A completed take becomes a local file automatically. The record control remains available.

### 3.2 Each take is independent

A session contains multiple takes, but each take can have its own:

- Name
- Tags
- Description
- One-shot or loop state
- BPM
- Visibility
- Edit recipe
- Output format
- Upload status

### 3.3 Retake should be immediate but safe

“Retake” means recording a replacement for a specific take.

Behavior:

1. Preserve the original take temporarily.
2. Start the replacement recording.
3. Keep the same sequence number and metadata defaults.
4. Replace the original only after the new recording is stopped and saved successfully.
5. Offer Undo for a short period.

If the replacement recording fails, preserve the original.

### 3.4 Discard should be fast but reversible

Discard removes the take from the working list immediately and presents an Undo action.

The actual binary file should not be permanently deleted until the Undo period expires or the cleanup job confirms deletion.

### 3.5 Metadata should start useful

Avoid empty fields wherever a responsible default exists.

Default metadata:

- **Name:** short stem + two-digit number (`Rain 01`); never em/en dashes
- **Tags:** session tags, recent tags, preset tags, or `recording`
- **Description:** generated session/take context
- **Kind:** one-shot
- **Visibility:** unlisted
- **Format:** WAV unless the user selects compact MP3
- **BPM:** unset unless loop mode or user input supplies it

Generated metadata remains visibly editable.

### 3.6 Local-first, not permanent storage

Every stopped take is stored locally to survive:

- Network loss
- Delayed review
- Navigation
- Closing and reopening the app
- Upload failure

However, local browser storage is not presented as cloud backup.

The app must state clearly:

- Clearing site data removes files.
- Private browsing may remove data at the end of the session.
- Files do not sync across devices.
- Closing the app may stop an active upload.

### 3.7 Simple interface, deep capability

The common path should be obvious:

`Record → Stop → Record another`

Advanced capability should be progressively disclosed:

`Review → Edit → Metadata → Upload`

## 4. Primary personas

### Mobile sound collector

Captures doors, machines, ambience, impacts, voices, textures, and environmental sounds while moving around.

Needs:

- Very fast repeated capture
- Strong outdoor readability
- Reliable local files
- Minimal typing
- Clear recording state

### Producer collecting one-shots

Records percussion, object hits, foley, and short tonal sounds.

Needs:

- Retake
- Fast trim and fade
- One-shot metadata
- Batch tags
- Compact upload workflow

### Loop-oriented musician

Records rhythmic or tonal phrases intended as loops.

Needs:

- Loop mode
- BPM
- Precise boundaries
- Fade or zero-crossing guidance
- WAV output

### Desktop reviewer

Returns later on desktop to organize and upload recordings made on mobile.

Needs:

- Dense but controlled overview
- Keyboard support
- Batch metadata
- Larger waveform editor
- Upload queue

Files remain device-local. A phone’s local files do not automatically appear on desktop.

## 5. Product scope

### MVP

- Audiotool OAuth login
- Mobile recording
- Multiple takes
- Session grouping
- Automatic local save
- Retake
- Discard with Undo
- File import
- Accurate waveform
- Trim
- Cut
- Fade in/out
- Peak normalization
- Metadata defaults
- One-shot/loop
- BPM for loops
- Unlisted/public
- WAV output
- MP3 output through client-side encoding
- Direct Audiotool upload
- Upload and processing states
- Local storage meter
- Responsive phone, tablet, and desktop UI

### Later

- Audiotool-owned sample listing
- Download, edit, and re-upload as a new sample
- Silence detection
- Zero-crossing snapping
- Loop-length tools
- BPM estimation
- High-pass filter
- Noise reduction
- LUFS normalization
- Multiresolution waveform cache
- Advanced capture presets
- Share-target/file-handler PWA integrations where supported

### Explicitly out of scope

- Multitrack sequencing
- Effects rack
- Arrangement timeline
- Permanent cloud backup
- Cross-device file sync
- Background server processing
- Collaborative editing
- Server-side transcoding
- Account passwords or personal access tokens stored in the app

## 6. Recording-length policy

### Recommended MVP hard limit: 10 minutes per take

Suggested UI behavior:

- Show no warning for the first 5 minutes.
- Show a passive duration warning at 5 minutes.
- Show remaining time from 8 minutes onward.
- Show a strong warning at 9 minutes.
- Stop and save automatically at 10 minutes.

Rationale:

- The intended use case is short field recordings.
- Decoded PCM is much larger than compressed source audio.
- Editing and rendering may require multiple buffers at once.
- Mobile memory limits vary widely.
- Browser-only MP3 encoding can be expensive.
- A hard limit protects local storage and application stability.

Imported files should initially use the same 10-minute editing limit.

A later version may permit longer files to be uploaded unchanged, without decoding or editing them.

## 7. Success metrics

Early product success should be assessed by workflow completion rather than engagement time.

Useful measures:

- Time from app open to first recording
- Time between stopping one take and starting the next
- Percentage of takes recovered after app restart
- Upload completion rate
- Upload retry success rate
- Percentage of uploads using generated metadata without major edits
- Retake and discard error recovery
- Editing completion time
- Crash-free 10-minute recording and render rate

---

# Source file: `02_UX_INFORMATION_ARCHITECTURE.md`

# UX and Information Architecture

## 1. Navigation model

### Root and stack

**Capture** is the root / default route — not one of three peer tabs.

Deeper surfaces are a stack with an explicit back control:

1. **Collection** (`/collection`) — back → Capture
2. **Take detail / editor** (`/take/[takeId]`) — back → Collection
3. **Account** — bottom sheet on mobile, centered modal on desktop. Open from the shell top bar (Capture / Collection / Debug). Keep `/account` as OAuth redirect host.
4. **Debug** (`/debug`) — quiet link from Account; back → Capture

There is **no** three-tab bottom navigation and **no** persistent Capture / Collection / Account rail.

Avoid a bottom-navigation item for the editor. Editing is contextual to a take.

### Tablet / desktop

Same stack model. Desktop Account is a modal; Collection and Take remain full pages with back chrome.

## 2. Primary mobile capture flow

### Entry state

Show:

- SampleScout wordmark
- Audiotool connection status
- Active session name
- Input settings summary
- Remaining local storage estimate
- Main record control
- Recent takes

The user must be able to record before signing into Audiotool. Login is required only before upload.

### Recording state

Show:

- Stop control
- Elapsed time
- Input meter
- Peak/clipping indicator
- Recording format
- Remaining maximum duration
- Cancel option

Keep nonessential navigation visually subdued.

### Stopped state

Immediately:

1. Finalize recording chunks.
2. Save the source file to local storage.
3. Create or update the take record.
4. Compute an initial waveform overview asynchronously.
5. Show `Local File` only after the OPFS + IndexedDB save gate.
6. Keep “Record another” prominent.

Actions:

- Play
- Record another
- Keep for later
- Retake
- Discard
- Edit
- Upload

“Keep for later” does not need to move the take anywhere; it confirms the current auto-saved state and collapses the take card.

## 3. Session behavior

A session is a lightweight grouping mechanism.

A session contains:

- Name
- Created time
- Last active time
- Default tags
- Default description template
- Default kind
- Default visibility
- Default output format
- Ordered take references

Default session name: `Session`. Datetime is Collection metadata (`dd/mm`), not part of the title. Rename from Capture via a bottom sheet (input + location/activity presets + remembered custom pills).

Starting a new session should not delete or finalize the old session.

## 4. Take stack

The mobile take stack should display the newest take first.

Each compact row contains:

- Sequence
- Editable name
- Accurate miniature waveform
- Duration
- Kind
- Local/upload state
- Play action
- Overflow menu

The most recent take may expand to show contextual actions.

Status language:

- Local File (saved on this device only)
- Unreviewed
- Edited
- Ready
- Rendering
- Uploading
- Processing in Audiotool
- Uploaded
- Failed

Do not label a take “saved” when only held in JavaScript memory.

## 5. Retake flow

1. User taps Retake on Take 004.
2. UI enters replacement mode and clearly says `Replacing Take 004`.
3. Original remains recoverable.
4. User records and stops.
5. New binary is saved.
6. Existing metadata and sequence are applied.
7. New source replaces the active source.
8. Toast: `Take 004 replaced — Undo`.
9. Original file is deleted after the Undo window expires.

Canceling replacement returns to the original take.

## 6. Discard flow

1. User taps Discard.
2. Take is removed from the visible stack.
3. Toast: `Take discarded — Undo`.
4. On Undo, restore the take and ordering.
5. After timeout, mark for binary cleanup.
6. Cleanup must be retryable.

Use a confirmation dialog only for bulk deletion or permanent cleanup of multiple unuploaded takes.

## 7. Metadata flow

Metadata should be editable in a sheet on mobile and a persistent panel on desktop.

Fields:

- Name
- Tags
- Description
- Kind: one-shot/loop
- BPM when loop is selected
- Visibility: unlisted/public
- Format: WAV/MP3
- MP3 quality when MP3 is selected
- Estimated output size

Prefill presentation:

- Generated values look like normal editable values.
- Small `AUTO` or `SESSION DEFAULT` labels may explain their source.
- Do not use placeholder text as the actual default.
- A reset-to-suggestion action should be available after manual changes.

## 8. Mobile editor

Use a dedicated full-screen route or overlay.

Structure:

- Header: Back, take name, undo/redo, Done
- Main region: precise waveform
- Transport: play/pause, selection play, time
- Tool rail: Trim, Cut, Fade, Normalize
- Context controls: values and toggles for selected tool
- Footer: Reset, Preview, Save changes

Mobile interaction rules:

- Minimum practical touch target: 44 × 44 CSS px
- Selection handles must have larger invisible hit areas than their visible stroke
- Pinch zoom is supported; plus/minus zoom controls remain available
- Overview navigator strip is required on the take editor
- Long press is not required for essential actions
- No hover-only controls
- Avoid horizontal page scrolling
- Waveform may scroll horizontally only while zoomed

## 9. Desktop workspace

Recommended structure:

### Left pane: sessions

- Session list
- Create session
- Search
- Storage usage
- Session defaults

### Middle-left pane: takes

- Multi-select
- Sort
- Filter
- Accurate waveform thumbnails
- Inline rename
- Duration
- Kind
- Status

### Center pane: waveform/editor

- Large precise waveform
- Timeline ruler
- Selection
- Tool controls
- Playback
- Zoom
- Original/edited duration

### Right pane: metadata/upload

- Metadata fields
- Output format
- Estimated size
- Audiotool destination
- Upload action
- Processing state

### Optional queue panel

- Queued
- Rendering
- Uploading
- Processing
- Failed
- Completed

Desktop should not be a stretched mobile layout.

## 10. Collection view (`/collection`)

Show sessions by default.

Session row/card:

- Name
- Last updated
- Take count
- Total duration
- Local size
- Upload summary

Within a session, show takes with:

- Waveform
- Name
- Duration
- Type
- Status
- Selection checkbox
- Overflow menu

Filters:

- All
- Unreviewed
- Edited
- Ready
- One-shots
- Loops
- Failed
- Uploaded

Bulk actions:

- Tags
- Description template
- Kind
- Visibility
- Format
- Upload
- Delete

## 11. Empty, error, and permission states

### Microphone not yet allowed

Explain why access is needed and trigger permission only from a user action.

### Permission denied

Provide browser-agnostic recovery guidance without pretending the app can reopen browser permission UI.

### Storage unavailable

Explain that recording cannot safely begin until space is freed.

### Audiotool disconnected

Allow all local functions. Block only upload and show Connect action.

### Unsupported browser/API

List the missing capability precisely:

- Microphone capture
- MediaRecorder
- OPFS
- Web Audio
- Required Audiotool SDK behavior

Offer file import if recording is unavailable but import remains possible.

### Upload interrupted

Preserve the local take. Mark upload failed. Provide Retry.

Do not claim resumable byte-level upload unless proven by the Audiotool API.

## 12. Responsive breakpoints

Treat breakpoints as layout transitions, not device labels.

Suggested starting points:

- `< 640 px`: single-pane mobile
- `640–1023 px`: two-pane tablet/compact desktop
- `>= 1024 px`: multi-pane desktop
- `>= 1440 px`: optional queue or inspector expansion

Verify behavior in:

- 320 px narrow mobile
- 390 px common mobile
- Mobile landscape
- Tablet portrait
- Tablet landscape
- 1280 px desktop
- 1440 px desktop
- 200% browser zoom

---

# Source file: `03_VISUAL_DESIGN_SYSTEM.md`

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
```

Use only for:

- Active recording
- Clipping
- Destructive confirmation
- Critical failure

Do not use signal color for ordinary navigation or decoration.

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

- Outer padding: 16 px
- List gap: 12 px (prefer air over packing)
- Major section gap: 24 px
- Fixed control safe-area padding: `env(safe-area-inset-bottom)`

### Desktop

- Pane padding: 16–24 px
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

- Black fill
- White text
- 1 px black border
- Clear pressed state
- Minimum 44 px mobile height

### Secondary

- White or transparent fill
- Black border
- Black text

### Destructive

- White background with signal border/text
- Filled signal style only during confirmation or active destructive recording state

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

Use a consistent thin-line icon set or custom icons.

Rules:

- 1.5–2 px strokes
- Square line caps where appropriate
- Icons accompanied by text for important actions
- No mixed icon families
- Avoid metaphorical icons when a text label is clearer

The SampleScout mark may combine:

- Precise waveform
- Crosshair
- Compass tick
- Sample marker

Avoid a generic location pin as the primary identity unless it is substantially differentiated.

## 9. Panels and lists

Use structural panels, not a collection of floating cards.

Take rows should resemble data records:

```text
[PLAY] TAKE 004    precise waveform    00:18.420
       Door latch                  UNREVIEWED
```

Use:

- Baseline alignment
- Vertical rules
- Numeric columns
- Stable row height
- Clear selected state

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

Avoid:

- Springy card animations
- Continuous ambient motion
- Pulsing everything during recording
- Waveform animation unrelated to actual input

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

---

# Source file: `04_WAVEFORM_AND_AUDIO_EDITOR.md`

# Waveform and Audio Editor Specification

## 1. Objective

The waveform is the core visual representation of the recorded material. It must be accurate enough to support editing decisions and visually consistent with SampleScout’s precise technical identity.

Do not use a stylized or heavily simplified waveform.

## 2. Rendering approach

### Recommended MVP

Use a high-DPI HTML Canvas renderer.

Reasons:

- Better performance than large SVG paths for long or frequently redrawn waveforms
- Direct control over pixel-aligned min/max peaks
- Suitable for zooming and scrolling
- Straightforward device-pixel-ratio scaling
- Compatible with worker-assisted peak calculation

Use SVG only for overlays if helpful:

- Selection handles
- Playhead
- Markers
- Labels

A layered approach is acceptable:

1. Canvas: waveform and grid
2. DOM/SVG: interactive handles and accessible controls
3. DOM: numeric values and toolbar

### Future optimization

Use `OffscreenCanvas` in a worker when supported, with a main-thread fallback.

WebGL is not required for the MVP.

## 3. Peak generation

### Overview waveform

For each visible horizontal pixel bucket:

1. Determine the corresponding sample-frame range.
2. Compute the actual minimum and maximum amplitude.
3. Draw a vertical segment from min to max.
4. Preserve transients; do not average them away.

This produces a truthful envelope.

### Multiresolution data

For the MVP, a single peak array may be generated for the standard overview width and regenerated after major resize.

Preferred later implementation:

- Build a multiresolution peak pyramid.
- Store min/max pairs for progressively larger sample buckets.
- Select the nearest resolution for the current zoom.
- Avoid repeatedly scanning the complete PCM buffer.

### Channel behavior

- Mono: one centered waveform
- Stereo overview: either two clearly labeled lanes or a documented combined peak envelope
- Stereo editor: prefer separate L/R lanes when vertical space permits
- Never silently show stereo as mono without an explicit display mode

## 4. High-DPI rendering

Scale canvas backing dimensions by `devicePixelRatio`.

Example principle:

```ts
canvas.width = Math.floor(cssWidth * devicePixelRatio);
canvas.height = Math.floor(cssHeight * devicePixelRatio);
context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
```

Redraw when:

- Container size changes
- Device pixel ratio changes
- Zoom changes
- Scroll position changes
- Edit recipe changes
- Channel display changes

Use `ResizeObserver`.

## 5. Visual waveform treatment

### Base

- Bright surface
- Black or near-black waveform
- Thin neutral zero line
- Neutral time grid
- No gradients
- No glow
- No heavy blur
- No decorative reflection

### Amplitude mapping

- Linear amplitude display by default
- Optional logarithmic visual mode may be explored later
- Normalization preview must update the displayed scale truthfully

### Anti-aliasing

Use browser canvas anti-aliasing but avoid additional curve smoothing.

A waveform is not a Bézier illustration.

## 6. Timeline

Show:

- Start at `00:00.000`
- Major ticks
- Minor ticks appropriate to zoom
- Current playhead time
- Selection start/end
- Duration

Tick density adapts to zoom.

Example intervals:

- Full 10-minute overview: 30 s or 60 s major ticks
- 1-minute view: 5 s or 10 s major ticks
- 10-second view: 1 s major ticks
- Sub-second zoom: 100 ms or sample-relevant divisions

Do not show labels that overlap.

## 7. Selection

Selection contains:

- Start time
- End time
- Duration
- Visible region shading
- Start handle
- End handle

Interaction:

- Drag either handle
- Drag selection body to move it where the operation allows
- Tap/click empty waveform to position playhead
- Shift-click on desktop to extend selection
- Arrow keys nudge active handle
- Modified arrow keys use finer/coarser increments
- Numeric input offers exact editing

Visible handles may be thin, but hit targets must be large.

## 8. Zoom and navigation

Mobile:

- Pinch to zoom (preserve time under pinch center)
- Two-finger drag to pan while zoomed
- Plus/minus buttons
- “Fit” (full take) and “Fit selection”
- Overview navigator strip (required on the take editor)

Desktop:

- Mouse wheel/trackpad zoom with Ctrl/⌘ modifier (preserve time under cursor)
- Horizontal scroll / Shift-drag / middle-drag to pan while zoomed
- Zoom buttons
- Fit selection
- Fit full take
- Overview navigator strip (required on the take editor)

The overview strip always shows the full take. Drag the viewport rectangle to pan, drag its edges to zoom, tap outside it to jump.

Zoom must preserve the time position under the pointer or gesture center when practical. Button zoom anchors on selection midpoint, then playhead, then view center.

Single-finger / primary-button drag on the main waveform remains selection (tap seeks). Do not use a Select/Pan mode toggle.

## 9. Playback

Support:

- Play from playhead
- Play selection
- Pause
- Return to selection start
- Loop selection during preview
- Stop at selection end when selection-play mode is active

The playhead must be based on audio clock timing, not only animation-frame accumulation.

UI updates may use `requestAnimationFrame`, but audio timing should derive from `AudioContext.currentTime` and playback start offset.

## 10. Edit model

Edits are non-destructive.

Recommended recipe operations:

```ts
type EditOperation =
	| { type: 'retain'; sourceStart: number; sourceEnd: number }
	| { type: 'fadeIn'; duration: number; curve: 'linear' | 'equalPower' }
	| { type: 'fadeOut'; duration: number; curve: 'linear' | 'equalPower' }
	| { type: 'gain'; gainDb: number }
	| { type: 'normalizePeak'; targetDbfs: number };
```

A more practical representation may store an ordered segment list with boundary fades and a take-level gain operation.

Do not rewrite the source file after every edit.

## 11. Trim and cut

### Trim

Retain the region between start and end.

### Cut

Remove the selected region and concatenate the remaining regions.

After cutting:

- Preserve edit history
- Update edited duration
- Recalculate displayed edited waveform from the recipe
- Avoid permanently rendering until export/upload

For MVP performance, the edited overview may be generated from retained source peaks when possible.

## 12. Fade

Support:

- Fade in at beginning of retained audio
- Fade out at end
- Optional fades at internal cut boundaries later

MVP curves:

- Linear
- Equal-power optional

Default fade duration should be short and explicit, not silently added.

Example initial value: 5 ms.

For cuts that may click, the app may suggest a fade but must not modify the audio without user confirmation.

## 13. Peak normalization

MVP normalization means peak normalization.

Recommended target:

`-1.0 dBFS`

Process:

1. Analyze the maximum absolute sample amplitude over retained audio.
2. Calculate required gain.
3. Display proposed gain.
4. Apply as a non-destructive gain operation.
5. Prevent gain that would exceed the target.

Do not call peak normalization “loudness normalization.”

LUFS normalization is later scope.

## 14. Rendering

Use `OfflineAudioContext` or a deterministic PCM rendering pipeline.

Rendering responsibilities:

- Concatenate retained segments
- Apply fades
- Apply gain/normalization
- Preserve sample rate unless conversion is intentionally required
- Preserve channel count unless user selects mono conversion
- Produce an `AudioBuffer` or PCM stream for encoding

## 15. WAV encoding

Implement a tested client-side WAV encoder.

MVP option:

- PCM 16-bit WAV for compatibility and reduced size

Optional high-quality mode:

- PCM 24-bit WAV

Do not label MediaRecorder’s compressed source as WAV unless it is actually rendered and encoded as WAV.

## 16. MP3 encoding

MP3 requires client-side third-party encoding because it should not depend on a custom backend.

Requirements:

- Run in a Web Worker
- Show encoding progress
- Offer cancellation
- Use one final encode only
- Support mono/stereo
- Offer a small number of understandable presets

Suggested presets:

- Compact: 96 kbps
- Standard: 128 kbps
- High: 192 kbps

For music-sensitive recordings, recommend WAV or 192 kbps MP3.

## 17. Waveform loading states

Before peaks are ready:

- Show a neutral measurement grid or progress line
- Label `ANALYZING WAVEFORM`
- Do not show a fake waveform

If peak analysis fails:

- Playback and upload may remain available
- Editor is disabled with a specific error
- Retry analysis action is offered

## 18. Performance rules

- Decode only the active edited take.
- Release `AudioBuffer` references when leaving the editor.
- Store waveform peak data separately from PCM.
- Use workers for peak generation and encoding.
- Avoid rendering the full waveform on every pointer move.
- During handle dragging, update overlays immediately and throttle expensive peak recomposition.
- Test with the full 10-minute limit on representative phones.

## 19. Acceptance criteria

- Waveform represents actual file data.
- Strong transients remain visibly present in overview mode.
- Display remains crisp on high-DPI mobile screens.
- Zoom does not replace the waveform with generic interpolation.
- Selection values match visible boundaries.
- Playback begins at the displayed playhead within practical UI tolerance.
- Trimmed/cut output duration matches the edit recipe.
- Normalization does not exceed the configured peak target.
- No fake waveform is shown after real audio exists.

---

# Source file: `05_TECHNICAL_ARCHITECTURE.md`

# Technical Architecture

## 1. Constraints

- Static browser application
- Hosted on GitHub Pages
- No custom backend
- Latest stable Svelte and SvelteKit at implementation time
- Direct Audiotool browser authentication and API calls
- Local browser storage for pending recordings
- Browser-side audio processing and encoding

## 2. Recommended stack

- Svelte
- SvelteKit
- TypeScript in strict mode
- `@sveltejs/adapter-static`
- Vite
- `@audiotool/nexus`
- IndexedDB wrapper such as Dexie, or a small typed internal wrapper
- OPFS for binary audio
- Web Audio API
- MediaRecorder
- Web Workers
- Canvas waveform renderer
- PWA manifest and service worker
- Vitest
- Playwright
- ESLint
- Prettier

Avoid introducing a large global state library before the domain needs it.

## 3. Application layers

```text
UI
├── Svelte routes
├── components
└── responsive layouts

Application
├── capture orchestration
├── take commands
├── editor commands
├── metadata defaults
└── upload queue

Domain
├── Session
├── Take
├── EditRecipe
├── UploadJob
└── state transitions

Infrastructure
├── MediaRecorder adapter
├── Web Audio renderer
├── WAV encoder
├── MP3 worker
├── OPFS repository
├── IndexedDB repository
├── Audiotool client
└── capability detection
```

Keep browser APIs behind typed adapters so they can be tested.

## 4. Suggested source structure

```text
src/
├── lib/
│   ├── audio/
│   │   ├── capture/
│   │   ├── decode/
│   │   ├── peaks/
│   │   ├── render/
│   │   ├── encode/
│   │   └── playback/
│   ├── audiotool/
│   ├── domain/
│   ├── persistence/
│   ├── state/
│   ├── ui/
│   │   ├── components/
│   │   ├── waveform/
│   │   └── layouts/
│   └── workers/
├── routes/
│   ├── +layout.svelte
│   ├── +page.svelte
│   ├── capture/
│   ├── collection/
│   ├── take/[takeId]/
│   └── account/
└── service-worker.ts
```

## 5. Capture pipeline

```text
User gesture
→ getUserMedia()
→ choose supported MediaRecorder MIME type
→ start MediaRecorder with timeslice
→ receive dataavailable chunks
→ append chunks to temporary local recording
→ stop
→ finalize source file
→ persist Take metadata
→ calculate waveform peaks in worker
→ mark saved; present as Local File
```

### Important implementation note

`MediaRecorder.start(timeslice)` produces periodic Blob chunks, but the timing interval is not exact. Do not derive recording duration by multiplying chunk count by timeslice.

Use a monotonic timer and inspect decoded duration after finalization.

### MIME selection

Detect support at runtime.

Potential preference order must be tested per browser. Do not hard-code a universal source format.

Store:

- Actual MIME type
- Browser-reported recorder MIME type
- File extension chosen by the app
- Duration
- Sample rate/channel metadata after decode when available

## 6. Local persistence

### IndexedDB

Store structured data:

- Sessions
- Takes
- Metadata
- Edit recipes
- Peak-data indexes
- Upload jobs
- Settings
- Pending cleanup records

### OPFS

Store binary data:

```text
/sessions/{sessionId}/takes/{takeId}/source.bin
/sessions/{sessionId}/takes/{takeId}/peaks-v1.bin
/sessions/{sessionId}/takes/{takeId}/rendered-{hash}.wav
/sessions/{sessionId}/takes/{takeId}/rendered-{hash}.mp3
/trash/{cleanupId}/...
```

Do not depend on user-visible filesystem access.

### Persistence sequence

For a completed take:

1. Finalize binary file.
2. Flush binary storage.
3. Write take record.
4. Commit status `saved`.
5. Update UI.

A take is not safely saved before steps 1–4 succeed.

### Storage management

Use `navigator.storage.estimate()`.

Before recording:

- Estimate available quota.
- Reserve a safety margin.
- Check against the maximum take policy.
- Block capture if safe storage cannot be guaranteed.

Request persistent storage when the user first chooses to keep files, but treat denial as normal.

## 7. Audio decoding and rendering

Use Web Audio for:

- Decode
- Playback
- Offline rendering
- Gain/fades

Only decode the active take.

Release resources after editor exit.

Use `OfflineAudioContext` for deterministic output rendering where practical.

## 8. Encoding

### WAV

Provide an internal encoder with tests.

Output options:

- 16-bit PCM default
- 24-bit PCM optional

### MP3

Use a maintained browser-compatible encoder compiled to WebAssembly or otherwise suitable for worker execution.

Before selecting a library, validate:

- License
- Bundle size
- Mobile performance
- Stereo support
- Cancellation behavior
- Memory behavior
- Maintenance activity

MP3 encoding is a client-side cost imposed by the no-backend constraint.

## 9. Audiotool authentication

Use browser OAuth2 PKCE through `@audiotool/nexus`.

Rules:

- Client ID may be present in frontend source.
- Redirect URL must exactly match the registered Audiotool redirect URI.
- Never embed a personal access token.
- Do not log access or refresh tokens.
- Do not persist exported tokens outside the SDK’s intended browser flow.
- Exact sample-related scopes must be established in an early spike.

Local development must use the host expected by Audiotool’s documentation, currently `127.0.0.1` rather than `localhost`.

## 10. Audiotool upload

Use the high-level samples upload API.

Upload lifecycle:

1. Create upload with metadata.
2. Upload bytes.
3. Wait for `uploaded`.
4. Wait for `ready`.
5. Mark local take uploaded only after successful processing.
6. Keep local file until ready succeeds.

Use fields supported by the current API:

- File
- Display name
- Description
- Tags
- Kind
- Visibility
- BPM

Validate currently accepted formats in the integration spike.

### Cancellation

If an Audiotool upload is abandoned, use the SDK’s cancellation behavior where available.

Preserve the local take.

### Foreground limitation

Do not promise that upload continues after the page is closed or suspended.

The service worker should not be treated as a reliable arbitrary large-file background uploader.

## 11. Upload queue

Use a persistent local queue.

Queue behavior:

- One active render/encode job on mobile
- One active upload by default
- Optional limited concurrency on desktop after validation
- Retry from local source
- Persist failure information
- Separate `uploaded` from `ready`

No server exists to continue jobs when the browser is closed.

## 12. PWA

Support:

- Installable manifest
- Offline shell
- Local capture when the app shell is cached
- App icons
- Theme/background colors
- Update notification

Do not cache Audiotool API responses indiscriminately.

Version persistence schemas and provide migrations.

## 13. Capability detection

At startup, assess:

- Secure context
- `navigator.mediaDevices`
- `getUserMedia`
- `MediaRecorder`
- Supported MIME types
- Web Audio
- OPFS
- IndexedDB
- Worker support
- Canvas
- Storage estimate
- Audiotool SDK initialization

Return a capability report used by the UI.

Avoid browser-name checks unless a documented SDK incompatibility requires them.

## 14. Security and privacy

- No backend
- No PAT
- No secret keys
- Microphone only after explicit user action
- No automatic geolocation
- No precise location in generated metadata
- Local files remain origin-private
- Provide a clear “Delete all local data” action
- Sanitize user-generated metadata before rendering
- Configure a restrictive Content Security Policy where GitHub Pages deployment permits via meta tags
- Review third-party WASM and codec dependencies

## 15. Testing strategy

### Unit

- Metadata defaults
- State transitions
- Edit recipes
- Peak calculations
- WAV encoding
- File-size estimates
- Naming sequences
- Retake/Undo logic

### Integration

- OPFS + IndexedDB persistence
- App restart recovery
- Upload queue persistence
- Render pipeline
- MP3 worker
- Audiotool OAuth callback
- Audiotool upload

### End-to-end

- Record three takes
- Retake one
- Discard and undo one
- Restart app
- Edit one
- Upload one
- Handle upload failure

### Device validation

At minimum:

- Android Chrome
- Desktop Chrome
- Desktop Firefox
- iPhone Safari as an explicit risk gate
- Desktop Safari if intended

Audiotool’s current Nexus documentation lists Chrome and Firefox among known browser platforms; Safari must be tested rather than assumed.

---

# Source file: `06_DATA_MODEL_AND_STATES.md`

# Data Model and States

## 1. Identifiers

Use opaque UUIDs generated locally.

```ts
type SessionId = string;
type TakeId = string;
type UploadJobId = string;
type FileRef = string;
```

Do not use array indexes as identifiers.

## 2. Session model

```ts
interface CaptureSession {
	id: SessionId;
	name: string;
	createdAt: string;
	updatedAt: string;
	status: 'active' | 'inactive' | 'archived';

	defaults: SessionDefaults;
	takeOrder: TakeId[];
}
```

```ts
interface SessionDefaults {
	tags: string[];
	descriptionTemplate: string;
	kind: 'one-shot' | 'loop';
	visibility: 'unlisted' | 'public';
	output: OutputSettings;
	bpm?: number;
}
```

## 3. Take model

```ts
interface Take {
	id: TakeId;
	sessionId: SessionId;
	sequence: number;

	createdAt: string;
	updatedAt: string;

	source: AudioSource;
	metadata: TakeMetadata;
	editRecipe: EditRecipe;
	output: OutputSettings;

	lifecycleState: TakeLifecycleState;
	reviewState: TakeReviewState;
	uploadState: TakeUploadState;

	peaks?: PeakAsset;
	renderedAsset?: RenderedAsset;
	replacement?: ReplacementState;
	lastError?: AppError;
}
```

## 4. Audio source

```ts
interface AudioSource {
	fileRef: FileRef;
	mimeType: string;
	byteLength: number;
	durationSeconds: number;
	channelCount?: number;
	sampleRate?: number;
	recorderMimeType?: string;
	sourceType: 'recording' | 'import';
	originalFileName?: string;
}
```

## 5. Metadata

```ts
interface TakeMetadata {
	displayName: string;
	description: string;
	tags: string[];
	kind: 'one-shot' | 'loop';
	visibility: 'unlisted' | 'public';
	bpm?: number;

	provenance: {
		displayName: MetadataOrigin;
		description: MetadataOrigin;
		tags: MetadataOrigin;
		kind: MetadataOrigin;
		visibility: MetadataOrigin;
		bpm?: MetadataOrigin;
	};
}
```

```ts
type MetadataOrigin =
	'application-default' | 'user-preference' | 'session-default' | 'generated' | 'manual';
```

## 6. Output settings

```ts
type OutputSettings =
	| {
			format: 'wav';
			bitDepth: 16 | 24;
	  }
	| {
			format: 'mp3';
			bitrateKbps: 96 | 128 | 192;
	  }
	| {
			format: 'source';
	  };
```

`source` is permitted only when:

- The source format is accepted by Audiotool.
- No audio edit requires rendering.
- No conversion/downmix is requested.

## 7. Edit recipe

```ts
interface EditRecipe {
	version: 1;
	segments: RetainedSegment[];
	peakNormalization?: {
		enabled: boolean;
		targetDbfs: number;
		calculatedGainDb?: number;
	};
}
```

```ts
interface RetainedSegment {
	id: string;
	sourceStartSeconds: number;
	sourceEndSeconds: number;
	fadeInSeconds: number;
	fadeOutSeconds: number;
	gainDb: number;
}
```

Initial recipe:

```ts
{
  version: 1,
  segments: [{
    id: crypto.randomUUID(),
    sourceStartSeconds: 0,
    sourceEndSeconds: source.durationSeconds,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    gainDb: 0
  }]
}
```

## 8. Peak asset

```ts
interface PeakAsset {
	version: 1;
	fileRef: FileRef;
	channels: number;
	framesPerPeak: number;
	peakCount: number;
	generatedAt: string;
}
```

Store binary min/max values rather than large JSON arrays.

## 9. Upload job

```ts
interface UploadJob {
	id: UploadJobId;
	takeId: TakeId;
	createdAt: string;
	updatedAt: string;

	state: UploadJobState;
	attempt: number;

	renderedFileRef?: FileRef;
	renderedByteLength?: number;

	audiotoolSampleName?: string;
	uploadedAt?: string;
	readyAt?: string;

	progress?: {
		phase: 'rendering' | 'encoding' | 'uploading' | 'processing';
		fraction?: number;
	};

	error?: AppError;
}
```

## 10. State types

```ts
type TakeLifecycleState = 'recording' | 'finalizing' | 'saved' | 'pending-delete' | 'deleted';

type TakeReviewState = 'unreviewed' | 'edited' | 'ready';

type TakeUploadState =
	| 'not-queued'
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'uploaded'
	| 'failed';

type UploadJobState =
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'completed'
	| 'failed'
	| 'canceled';
```

## 11. Capture state machine

```text
idle
→ requesting-permission
→ preparing
→ recording
→ stopping
→ finalizing
→ saved
→ idle
```

Failure branches:

```text
requesting-permission → permission-denied
preparing → capture-error
recording → interrupted
stopping/finalizing → save-error
```

No transition to `saved` is allowed before persistence succeeds.

## 12. Retake state machine

```text
none
→ armed
→ recording-replacement
→ saving-replacement
→ replacement-ready
→ undo-window
→ committed
```

Failure:

```text
recording-replacement/saving-replacement
→ failed
→ original-restored
```

## 13. Discard state machine

```text
visible
→ hidden-undoable
→ restored
```

or:

```text
visible
→ hidden-undoable
→ pending-delete
→ deleted
```

## 14. Upload state machine

```text
not-queued
→ queued
→ rendering
→ encoding (MP3 only)
→ uploading
→ processing
→ uploaded
```

Any active state may transition to:

- failed
- canceled where supported

Retry returns to the earliest required step.

Examples:

- Existing valid rendered file: retry upload
- Missing rendered file: retry render
- Source changed: invalidate rendered asset and restart render

## 15. Render cache key

Rendered output should be keyed by:

- Source file identity/hash
- Edit recipe version/content
- Output settings
- Channel conversion
- Sample-rate conversion

Changing metadata alone must not invalidate rendered audio.

## 16. Error model

```ts
interface AppError {
	code: string;
	message: string;
	recoverable: boolean;
	cause?: unknown;
	context?: Record<string, string | number | boolean>;
	occurredAt: string;
}
```

Suggested codes:

- `MIC_PERMISSION_DENIED`
- `MIC_UNAVAILABLE`
- `RECORDER_UNSUPPORTED`
- `RECORDER_FAILED`
- `STORAGE_QUOTA_LOW`
- `SOURCE_SAVE_FAILED`
- `DECODE_FAILED`
- `PEAK_ANALYSIS_FAILED`
- `RENDER_FAILED`
- `ENCODE_FAILED`
- `AUDIOTOOL_AUTH_FAILED`
- `AUDIOTOOL_PERMISSION_FAILED`
- `UPLOAD_FAILED`
- `PROCESSING_FAILED`

Do not expose raw token or sensitive response data in errors.

---

# Source file: `07_MVP_ACCEPTANCE_CRITERIA.md`

# MVP and Acceptance Criteria

## 1. Phase 0 — Technical spikes

These must be completed before full feature development.

### Audiotool browser authentication

- Register development application.
- Confirm exact redirect URI behavior.
- Determine exact scopes required for sample upload and management.
- Confirm direct browser login from the intended GitHub Pages URL.
- Confirm logout and re-login behavior.

### Audiotool upload

Upload one file with:

- Name
- Description
- Tags
- One-shot
- Unlisted
- WAV

Then repeat with:

- Loop
- BPM
- Public
- MP3

Record actual API errors and format restrictions.

### Browser compatibility

Validate:

- Android Chrome
- Desktop Chrome
- Desktop Firefox
- iPhone Safari

Safari failure is a release decision because no backend fallback will exist.

### Storage

- Record multiple chunks.
- Persist to OPFS.
- Close app.
- Reopen app.
- Restore complete source.
- Delete source.
- Verify storage estimate.

### Performance

- Record 10 minutes.
- Generate peaks.
- Decode.
- Trim.
- Normalize.
- Render WAV.
- Encode MP3.
- Measure memory and time on representative phones.

## 2. Phase 1 — Capture foundation

### Acceptance criteria

- User can record after a direct permission gesture.
- Recording state is unambiguous.
- Stopping finalizes and locally saves the take.
- UI does not show `Local File` before persistence succeeds.
- User can record another take immediately.
- Three or more takes remain independently playable.
- App restart restores takes and session order.
- Ten-minute auto-stop works.
- Low-storage condition blocks unsafe recording with a clear explanation.

## 3. Phase 2 — Take management

### Acceptance criteria

- Newest take appears first on mobile.
- Inline rename works.
- Retake preserves sequence and metadata.
- Failed retake preserves original.
- Retake Undo restores original.
- Discard removes take immediately.
- Discard Undo restores take.
- Expired discard removes binary through cleanup.
- Cleanup failures remain retryable.
- Session rename and defaults affect new takes only unless user applies them in bulk.

## 4. Phase 3 — Accurate waveform and playback

### Acceptance criteria

- Waveform is generated from actual audio data.
- No fake waveform is displayed after loading.
- Transients are visible in overview.
- Waveform is crisp at device pixel ratio.
- Playback position and playhead remain synchronized.
- Zoom and fit work.
- Mobile handles have adequate hit areas.
- Numeric selection values are editable.
- Stereo display behavior is explicit.

## 5. Phase 4 — Editing

### Acceptance criteria

- Trim changes output duration correctly.
- Cut can remove at least one interior region.
- Fade in and fade out affect rendered output.
- Peak normalization reaches target without exceeding it.
- Undo and redo work.
- Reset restores initial recipe.
- Source file remains unchanged.
- Edited recipe survives restart.
- Editor releases large decoded buffers after exit.

## 6. Phase 5 — Metadata

### Acceptance criteria

- Every new take has a generated name.
- Every new take has at least one usable tag or falls back safely.
- Description is prefilled and editable.
- One-shot is default.
- Loop reveals BPM field.
- Unlisted is default.
- Public requires deliberate selection.
- Batch metadata applies to selected takes.
- Manual overrides are not overwritten by later session-default changes.
- Source of generated/default metadata can be understood by the user.

## 7. Phase 6 — Export

### WAV

- Produces a valid WAV.
- Duration matches recipe.
- Channel count is preserved unless changed intentionally.
- 16-bit output works.
- 24-bit output works if included.
- File-size estimate is within an acceptable tolerance.

### MP3

- Encoding occurs off the main thread.
- Progress is visible.
- User can cancel.
- Output plays correctly.
- Bitrate selection works.
- A failed encode preserves source and recipe.
- Ten-minute encoding does not freeze the UI.

## 8. Phase 7 — Audiotool upload

### Acceptance criteria

- User can connect and disconnect Audiotool.
- Local capture/edit works while disconnected.
- Upload validates required metadata.
- Upload distinguishes byte upload from Audiotool processing.
- Take is marked uploaded only after processing is ready.
- Local source is preserved until ready succeeds.
- Failure exposes Retry.
- Closing-page warning appears during active upload if supported.
- Abandoned upload is canceled through SDK behavior where available.
- Unlisted is sent as default.
- Direct GitHub Pages deployment works.

## 9. Phase 8 — Responsive and accessible UI

### Mobile

- Works at 320 px width.
- Primary record/stop action stays reachable.
- No essential hover interaction.
- Safe-area handling works.
- Outdoor-bright visual design remains readable.
- 44 px minimum practical touch targets.
- Editor remains usable in portrait.

### Tablet

- Two-pane layout works.
- Editor and take list remain visible together when space permits.

### Desktop

- Multi-pane layout uses width intentionally.
- Keyboard navigation works.
- Focus is visible.
- Multi-select and batch editing work.
- UI remains usable at 200% zoom.

### Visual

- Bright/off-white primary background.
- Monochrome technical hierarchy.
- Mono typography dominates.
- Waveform is accurate and detailed.
- No dark-first DAW aesthetic.
- No decorative simplified waveform.

## 10. Definition of done

A feature is done only when:

- Domain behavior is tested.
- Persistence behavior is tested.
- Error state is designed.
- Keyboard and touch behavior are considered.
- Restart/recovery behavior is known.
- No-backend constraints are respected.
- Browser support assumption is documented.

---

# Source file: `08_CURSOR_BUILD_BRIEF.md`

# Cursor Build Brief

Use this document as the primary implementation instruction.

---

Build **SampleScout**, a mobile-first responsive Svelte/SvelteKit PWA for recording, editing, locally storing, and uploading audio samples to Audiotool.

## Hard constraints

- Use the latest stable Svelte and SvelteKit available when the project is initialized.
- Use TypeScript with strict settings.
- Build as a static application using `@sveltejs/adapter-static`.
- Production hosting is GitHub Pages.
- Do not create or assume any custom backend, API route, serverless function, database server, or secret-storage service.
- Audiotool authentication and upload happen directly in the browser.
- Never embed a personal access token.
- Local files use browser storage.
- The UI is bright, black/white/neutral gray, technical, precise, and primarily monospaced.
- Waveforms must be calculated from real audio and rendered precisely.
- Do not use a generic or decorative waveform.
- Default Audiotool visibility is `unlisted`.
- Default sample kind is `one-shot`.
- Recommended hard maximum is 10 minutes per take.

Before adding dependencies, explain what each dependency is needed for. Prefer browser APIs and small focused libraries.

## Product behavior

A user can:

1. Connect through the current Audiotool auth splash, then enter Capture.
2. Record a take through the phone microphone.
3. Stop and have the take saved locally automatically.
4. Immediately record another unrelated take.
5. Leave any take unreviewed for later.
6. Retake a take while preserving its sequence number and metadata.
7. Discard a take with a temporary Undo.
8. Import an existing audio file.
9. View an accurate waveform.
10. Trim, cut, fade, and peak-normalize non-destructively.
11. Review prefilled metadata.
12. Upload WAV or MP3 directly to Audiotool.
13. Close and reopen the app and recover saved local takes.

## Product boundaries

Do not build:

- Multitrack editing
- Arrangement timeline
- Effects rack
- Cross-device synchronization
- Cloud backup
- Background server upload
- Server transcoding
- A custom account system

Do not claim uploads continue after the browser is closed.

## Initial routes

```text
/
  Redirect or render Capture

/capture
  Active session and recording workflow

/collection
  Local sessions and takes

/take/[takeId]
  Editor and metadata

/account
  Audiotool connection and local-data settings
```

Keep routing compatible with GitHub Pages base paths.

## Architecture

Create typed modules for:

- Domain models
- Capture orchestration
- Browser capability detection
- OPFS binary repository
- IndexedDB metadata repository
- Peak generation
- Waveform renderer
- Playback
- Non-destructive edit recipes
- Offline rendering
- WAV encoding
- MP3 worker encoding
- Audiotool authentication
- Audiotool upload queue

Do not place audio logic directly inside large Svelte components.

## Persistence

Use:

- OPFS for source audio, peak binaries, and rendered output
- IndexedDB for sessions, takes, metadata, edit recipes, queue state, and cleanup jobs

Persistence rule:

A take can be labeled `Local File` only after the binary and its metadata record have been committed successfully; it means saved on this device only.

Create schema versions and migration scaffolding from the start.

## Recording

Use:

- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`
- Runtime MIME detection
- Periodic `dataavailable` chunks
- Accurate elapsed timing independent of chunk count

Store actual MIME type and recorder MIME type.

Do not assume MP3 or WAV recording directly from MediaRecorder.

Provide:

- Timer
- Input meter
- Clipping indicator
- Stop
- Cancel
- Remaining maximum time
- Local-storage safety check

## Recording limit

Implement a configurable hard maximum with an MVP default of 10 minutes.

Warnings:

- Passive at 5 minutes
- Remaining time at 8 minutes
- Strong warning at 9 minutes
- Auto-stop and save at 10 minutes

## Retake

Retake is transactional:

- Keep original.
- Record replacement.
- Save replacement.
- Swap only after successful save.
- Offer Undo.
- Delete old source only after Undo expires.
- Restore original if replacement fails.

## Discard

Discard is optimistic:

- Hide take immediately.
- Show Undo.
- Mark file for cleanup after timeout.
- Cleanup is persistent and retryable.

## Metadata defaults

Generate:

```text
Name:
[Session Name] — [three-digit sequence]

Description:
Recorded during “[Session Name]” on [date]. Take [sequence].

Tags:
Session tags → recent tags → preset tags → recording

Kind:
one-shot

Visibility:
unlisted
```

Track whether each field came from an application default, session default, generated suggestion, or manual override.

Changing a session default must not overwrite existing manual values.

## Waveform

Build a high-DPI Canvas waveform renderer.

Requirements:

- Use actual decoded PCM.
- For overview, calculate min/max amplitude per horizontal bucket.
- Preserve transients.
- Draw a clear zero axis.
- Draw adaptive time ticks.
- Support mono and explicit stereo display.
- Scale canvas by device pixel ratio.
- Redraw with `ResizeObserver`.
- Show `ANALYZING WAVEFORM` before real peak data exists.
- Never show a fake waveform after audio is loaded.

Prefer a canvas waveform plus accessible DOM/SVG overlays for playhead and handles.

Use workers for peak generation.

## Editor

Non-destructive recipe:

- Retained source segments
- Boundary fades
- Gain
- Peak normalization

Tools:

- Trim
- Cut
- Fade in
- Fade out
- Normalize to -1 dBFS
- Undo
- Redo
- Reset
- Preview

Use `OfflineAudioContext` or a deterministic PCM pipeline to render final output.

Decode only the active edited take and release large buffers on editor exit.

## WAV

Implement a tested WAV encoder.

Default:

- PCM 16-bit

Optional:

- PCM 24-bit

## MP3

MP3 must be encoded entirely in the browser.

Select a maintained encoder after checking:

- License
- Bundle size
- Worker compatibility
- Mobile performance
- Stereo support
- Cancellation
- Memory use

Presets:

- 96 kbps
- 128 kbps
- 192 kbps

Run encoding in a worker and expose progress.

## Audiotool

Install `@audiotool/nexus`.

Use browser OAuth2 PKCE.

Development must use the exact redirect host/URL required by Audiotool. Production must use the exact GitHub Pages or custom-domain redirect URL registered in the Audiotool developer dashboard.

Create an integration spike before assuming scopes.

Use the high-level sample upload API and support metadata:

- displayName
- description
- tags
- kind
- visibility
- bpm
- file

Distinguish:

- Rendering
- Encoding
- Uploading bytes
- Processing in Audiotool
- Ready

Keep local audio until Audiotool processing is ready.

## Responsive UI

### Mobile

- Bright off-white background
- Fixed, reachable record/stop control
- Collection shortcut from Capture when local files exist
- Newest takes first
- One-handed operation
- 44 px touch targets
- No hover dependencies
- Full-screen editor
- Metadata sheet
- Safe-area padding

### Tablet

- Take list plus active workspace
- Metadata in side sheet or pane

### Desktop

Use multiple structural panes:

1. Sessions
2. Takes
3. Waveform/editor
4. Metadata/upload
5. Optional queue

Do not stretch mobile cards across the screen.

## Visual system

Use:

- Off-white page background
- White work surfaces
- Black text
- Neutral gray rules
- Optional red signal color only for record/clipping/destructive states
- 1 px borders
- Minimal shadow
- Small radii
- Stable grid
- Tabular numerals
- Mono typography

Avoid:

- Dark-first interface
- Gradients
- Glassmorphism
- Neon
- Excessive rounded cards
- Decorative animation
- Cartoon waveform
- Generic dashboard templates

## Component priorities

Create reusable components for:

- Record control
- Input meter
- Timer
- Take row
- Expanded take
- Waveform overview
- Waveform editor
- Selection handles
- Status label
- Metadata field
- Tag input
- Kind selector
- Visibility selector
- Format selector
- Upload progress
- Undo toast
- Storage meter
- Empty state
- Permission state
- Error state

## Development order

1. Scaffold static SvelteKit and GitHub Pages path handling.
2. Build capability report.
3. Build domain models and persistence.
4. Build recording spike.
5. Build take stack and recovery.
6. Build accurate waveform pipeline.
7. Build editor recipe and rendering.
8. Build WAV.
9. Validate client-side MP3.
10. Validate Audiotool OAuth/upload.
11. Build metadata defaults.
12. Build upload queue.
13. Complete responsive desktop UI.
14. Add PWA/update behavior.
15. Run device validation.

At each phase, implement errors and restart recovery before proceeding.

## Required documentation while coding

Maintain:

- `README.md`
- `docs/architecture.md`
- `docs/browser-support.md`
- `docs/audiotool-integration.md`
- `docs/persistence-schema.md`
- `docs/decisions/` ADRs

Document all features that are unavailable because there is no backend.

---

# Source file: `09_GITHUB_PAGES_DEPLOYMENT.md`

# GitHub Pages Deployment

## 1. Hosting model

SampleScout should build into static files and deploy through GitHub Actions to GitHub Pages.

Use:

- SvelteKit
- `@sveltejs/adapter-static`
- GitHub Pages Actions deployment
- HTTPS provided by GitHub Pages

No runtime server is available.

## 2. Repository URL behavior

Two URL shapes are possible.

### User/organization site

Repository:

`username.github.io`

Production root:

`https://username.github.io/`

Base path:

empty

### Project site

Repository:

`sample-scout`

Production root:

`https://username.github.io/sample-scout/`

Base path:

`/sample-scout`

SvelteKit must configure `paths.base` appropriately for a project site.

All of the following must respect the base path:

- Links
- Assets
- Manifest
- Service worker
- Icons
- OAuth callback
- Application navigation
- Fallback page

Do not hard-code root-relative `/capture` URLs for a project site.

## 3. Static adapter

Use `@sveltejs/adapter-static`.

GitHub Pages has no server-side route fallback. Configure:

- Prerendered routes where possible
- `404.html` fallback if client-side routing requires it
- Appropriate trailing-slash behavior
- Correct base path

Prefer simple prerendered route shells over a single empty SPA shell where feasible.

## 4. Audiotool redirect URI

The production `redirectUrl` must match the Audiotool registered redirect URI exactly.

Pay attention to:

- Scheme: `https`
- Host
- Repository base path
- Callback path
- Trailing slash
- Custom domain changes

Example project-site callback:

`https://username.github.io/sample-scout/account/`

Register the exact selected URL in the Audiotool developer application.

A later custom-domain migration requires adding or changing the registered redirect URI and testing login again.

## 5. Development redirect URI

Follow Audiotool’s current browser-authentication documentation for the local host and port.

At the time of this briefing, the official documentation specifies `127.0.0.1` and warns against using `localhost` for the registered development redirect.

Keep the dev redirect configurable through public build-time configuration, not a secret.

## 6. Public configuration

Safe frontend configuration:

- Audiotool client ID
- Audiotool OAuth scopes
- Redirect URL
- GitHub Pages base path
- App version

Do not put secrets in:

- Repository variables
- Frontend environment variables
- Source code
- GitHub Actions build arguments

A personal access token is never appropriate for the public app.

## 7. GitHub Actions

The workflow should:

1. Check out repository.
2. Set up Node.
3. Install with lockfile.
4. Run formatting/lint/type checks.
5. Run unit tests.
6. Build SvelteKit static output.
7. Upload the Pages artifact.
8. Deploy with the official Pages action.

Pin major action versions intentionally and review updates.

## 8. PWA scope

For a project site, service-worker scope must remain under the repository base path.

Verify:

- App installs from the intended URL.
- Offline shell works under the base path.
- Navigation does not escape to domain root.
- Manifest `start_url` is correct.
- Icon paths are correct.
- OAuth callback is not broken by the service worker.
- New deployments update cleanly.

## 9. Caching

Cache:

- Application shell
- Fonts if locally bundled
- Icons
- Static assets

Use caution for:

- OAuth callback documents
- Audiotool API requests
- Upload requests
- Audio binaries in OPFS

Do not place local recordings in Cache Storage when OPFS is the intended binary repository.

## 10. Security headers

GitHub Pages offers limited control over response headers.

Use what is feasible in static HTML:

- CSP meta tag after testing
- `Referrer-Policy` meta tag
- Avoid inline scripts where practical
- Dependency review
- Subresource integrity only where it is maintainable

Do not claim that meta-delivered policies are equivalent to full server-header control.

## 11. Custom domain

A custom domain may improve:

- Branding
- Stable OAuth redirect URL
- Shorter install URL

But it introduces:

- DNS configuration
- Audiotool redirect update
- Service-worker migration considerations
- Old-origin local files remaining on the old origin

Browser storage is origin-bound. Changing from a GitHub project URL to a custom domain does not migrate local files automatically.

This should be decided before public usage if possible.

## 12. GitHub Pages limitations relevant to the app

GitHub Pages hosts application assets only.

It does not provide:

- API routes
- Secret storage
- Server transcoding
- Cross-device storage
- Reliable background upload
- Scheduled cleanup
- OAuth token server sessions

Any design that assumes those features violates the no-backend constraint.

---

# Source file: `10_RESEARCH_AND_OPEN_RISKS.md`

# Research Notes and Open Risks

## 1. Verified architectural basis

### Static SvelteKit

SvelteKit’s official `adapter-static` generates a collection of static files and includes specific guidance for GitHub Pages base paths and a `404.html` fallback.

Source:

- https://svelte.dev/docs/kit/adapter-static

### GitHub Pages deployment

GitHub’s official Pages workflow supports uploading a built artifact and deploying it through the Pages deployment action.

Source:

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

### Browser recording

`getUserMedia()` provides microphone streams after permission, and `MediaRecorder` records the stream.

`MediaRecorder.start(timeslice)` emits periodic chunks, but the interval is not guaranteed to be exact.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start

### Browser editing/rendering

`OfflineAudioContext` renders an audio graph into an `AudioBuffer` without outputting it to audio hardware.

Source:

- https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext

### Local binary storage

OPFS is private to the application origin, optimized for file access, subject to browser quota, and deleted when site storage is cleared.

Storage usage and quota can be estimated through `navigator.storage.estimate()`.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate

### Audiotool browser authentication

Audiotool’s Nexus SDK currently documents browser OAuth2 PKCE through `audiotool()`. The client ID, redirect URI, and scopes are public configuration. Exact redirect matching is required.

Source:

- https://developer.audiotool.com/js-package-documentation/documents/Authentication.html

### Audiotool sample upload

The Nexus documentation exposes a high-level samples API with upload, uploaded, ready, listing, download, and deletion behaviors.

Source:

- https://developer.audiotool.com/js-package-documentation/documents/API.html

## 2. Current Audiotool risks

### SDK maturity

The current documentation describes Nexus as under heavy development and warns that backend changes may break it.

Mitigation:

- Lock dependency versions.
- Add integration tests.
- Avoid deep coupling to generated internal types.
- Wrap SDK access in a local adapter.
- Track release notes.

### Supported browsers

Current Nexus documentation lists Chrome and Firefox as known browser platforms. Safari is not listed.

Mitigation:

- Make Safari an explicit proof-of-concept gate.
- Do not promise iPhone support before testing authentication and sample upload.
- Keep all local capture/edit behavior separated from Audiotool integration so the app can explain an integration limitation precisely.

### Scopes

Audiotool’s authentication guide says scopes for calls outside the project examples are not yet fully documented.

Mitigation:

- Determine sample upload scopes in the first integration spike.
- Record working scope strings in project documentation.
- Handle `insufficient_permissions` distinctly.

### Format and size limits

The high-level API documents common sample formats, but the practical maximum upload size/duration should be tested.

Mitigation:

- Use SampleScout’s own 10-minute take limit.
- Test representative WAV and MP3 sizes.
- Present API errors without data loss.

## 3. No-backend limitations

The following require a backend or third-party hosted service and are excluded.

### Guaranteed upload after closing

A browser page cannot promise to complete arbitrary large uploads after it is closed or suspended.

Current behavior:

- Keep job locally.
- Restart or retry when app is open.

### Cross-device files

OPFS and IndexedDB are origin- and device-local.

### Cloud backup

No remote storage exists.

### Server transcoding

MP3 must be encoded on the device.

### Hidden API secrets

Any service requiring a confidential key cannot be safely called directly from a public GitHub Pages app.

### Server-side Safari bridge

There is no Node fallback if Nexus does not function in Safari.

## 4. Product risks

### Users mistake local files for backup

Mitigation:

- Use supporting copy that Local File means not uploaded and only on this device.
- Show storage origin/device language.
- Explain clearing browser data.
- Offer delete-after-upload preference.
- Avoid cloud icons for local save.

### Long recordings exhaust memory

Mitigation:

- Ten-minute hard limit.
- Mono capture preference.
- Decode one active take.
- Workers.
- Storage checks.
- Test worst-case stereo imports.

### MP3 encoding is slow

Mitigation:

- WAV remains primary and lowest risk.
- Show progress.
- Worker execution.
- Small preset list.
- Allow upload in source format when no render is needed and Audiotool accepts it.

### Waveform generation becomes visually fake for performance

Mitigation:

- Min/max peak envelopes.
- Multiresolution cache later.
- No smoothing into decorative shapes.
- Show analysis state rather than placeholder art.

### GitHub custom-domain migration loses apparent access to files

Browser storage is bound to the old origin.

Mitigation:

- Decide the public origin early.
- Document migration limitations.
- Optionally create user-initiated export/import later.

## 5. Decisions still required

- Final public origin: GitHub project URL or custom domain
- Final OAuth callback route
- Exact Audiotool scopes
- Safari launch support
- MP3 encoder library
- IndexedDB wrapper
- Default recording constraints
- 16-bit vs 24-bit WAV default
- Mono-by-default policy
- Exact storage safety margin
- Whether source-format pass-through belongs in MVP
- Whether app installation is promoted before Safari validation

## 6. Recommended immediate next step

Build a deliberately unattractive technical spike before designing the full interface.

The spike must:

1. Authenticate with Audiotool from the intended static origin.
2. Record three takes.
3. Persist and restore them.
4. Render a truthful waveform.
5. Trim one take.
6. Encode WAV.
7. Upload it as unlisted one-shot with metadata.
8. Repeat with MP3.
9. Run on Android Chrome and iPhone Safari.

Only after this succeeds should the full interface be implemented.
