# Waveform and Audio Editor Specification

## 1. Objective

The waveform is the core visual representation of the recorded material. It must be accurate enough to support editing decisions and visually consistent with SampleScout’s precise technical identity.

Do not use a stylized or heavily simplified waveform.

Collection specimen marks are a separate catalog-identity element. They are deterministically derived from persisted take/source facts, not PCM peaks, audio fingerprints, or signal analysis. They must never be shown as, overlaid on, or substituted for the real waveform. All waveform accuracy rules below remain unchanged.

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

### Live capture overview

While recording, SampleScout draws a growing overview from **real** AnalyserNode time-domain min/max buckets (one bucket per capture tick). This is measurement of the live input, not a decorative animation.

Rules:

- Canvas + `devicePixelRatio`, clear zero axis
- Preserve per-bucket min/max (no smoothing into blobs)
- `--signal` only while clipping
- While recording: fill remaining Capture height and full viewport width — no separate panel background, border, or radius
- Do not invent random or placeholder shapes

After the take is saved, Phase 3 worker PCM peaks replace this provisional overview for editing.

### Multiresolution data

Overview peaks are a single ~4096-bucket PKS1 array for fit / navigator / modest zoom.

When the visible window would stretch those buckets below one peak per canvas column, the take editor lazily decodes source PCM (cached while the take is open) and draws sample-accurate min/max peaks for the visible range on the main waveform. The navigator keeps the overview.

Preferred later enhancement:

- Build a multiresolution peak pyramid for mid-zoom without a full decode.
- Store min/max pairs for progressively larger sample buckets.
- Select the nearest resolution for the current zoom.

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
- Normalization preview must update the displayed scale truthfully for retained audio; the same preview gain is drawn across discarded context so edge-finding stays continuous (exclusion is marked by `--disabled` color/wash, not a second amplitude scale)

### Anti-aliasing

Use browser canvas anti-aliasing but avoid additional curve smoothing.

A waveform is not a Bézier illustration.

### Retained / trim boundaries

Trim grips and **2px `--signal` vertical strokes** at each retained-range start and end stay visible on the main waveform and overview navigator even when retained bounds match the full take (identity recipe), so users can always drag to trim. Discarded source regions (outside retained bounds) on the **main waveform** and overview use a `--disabled` wash and `--disabled` peaks so excluded audio reads as off / not part of the uploaded result; retained audio stays normal `--ink` peaks on paper (no retained-band highlight wash). When peak-normalize preview gain is active, apply that gain across the **full visible wave** (retained and discarded) so edge-finding stays continuous; discarded material is marked by color/wash, not a different amplitude scale. Navigator markers stay strokes only for boundaries; discarded wash may still appear between retained segments. On the main waveform, canvas strokes are paired with **DOM grip tabs** that hang **below** the wave frame (block tab only — no connecting stem; the canvas boundary is the vertical line; idle `--signal`, near `--touch-min` hit area). Markers and grips are draggable (`col-resize` cursor); dragging adjusts the edit recipe retained bounds and commits on release as one undo step. **While a trim edge is being dragged**, that grip tab and its matching canvas boundary stroke (main + navigator) switch to `--brand` (same token as action toasts / selection — not `--ink`); other trim edges stay `--signal`. Fade grips soften to **40% transparent** for the duration of the trim drag so the active trim edge reads clearly.

### Fade grips

Fade in/out use a distinct grip language from trim: **`--ink` wedge (ramp triangle) tabs** sit on the **bottom edge of the time ruler** (the ruler includes extra bottom pad below the ticks/labels for these grips; tabs are not over the peak area and not outside the frame). Fade-in is always anchored at the earliest retained (trim) start; fade-out at the latest retained end. Dragging the inner fade grip sets duration (zero at the trim edge; each fade may use up to the full retained duration, but **fade-in + fade-out must not overlap** — the other fade reserves its length). The waveform visualizes fades by scaling peak amplitude by the linear fade gain and drawing a **dashed `--ink` envelope diagonal** across each fade region. Fades are not Edit-sheet buttons — adjust them on the waveform. Do not silently add a default fade; duration starts at zero until the user drags.

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
- Visible region shading (`--brand-soft` fill under peaks at ~0.8 alpha + `--brand` edges on top; selection grips use brand — distinct from `--signal` trim). Ink peaks draw above the selection wash so they stay crisp, not mint-tinted.
- Start handle
- End handle

Selection is the **working region** for Collect: bounds, fade grips, and auto peak-normalize preview. A usable selection (narrower than the full source) enables **Collect**. There is no separate Trim step.

**Suggested Regions** ([`11_SUGGESTED_REGIONS.md`](11_SUGGESTED_REGIONS.md)) may jump the selection to a rough source range (brand selection chrome). While the user is navigating scouted regions, the main waveform and overview also show muted `--ink-muted` bands/ticks for **all** scouted candidates (not specimen neon, not `--signal` trim). Idle (count visible, not yet engaged) shows no multi-candidate overlay. Auto-fit after a scouted jump matches a completed manual selection gesture. Suggestions never invent decorative waveform content.

Interaction:

- Drag either handle
- Drag selection body to move it where the operation allows
- Tap/click empty waveform to position playhead
- Shift-click on desktop to extend selection
- Arrow keys nudge active handle
- Modified arrow keys use finer/coarser increments
- Numeric input offers exact editing
- Clear selection via a dedicated Clear control next to selection inputs (MVP: Collect clears selection and selection fades after success)

Visible handles may be thin, but hit targets must be large (near half `--touch-min` on canvas edges; DOM grips at `--touch-min`). At zero fade, pointer in the time-ruler fade band prefers fade grips; horizontal drag on the wave body near a selection or retained edge prefers the region edge grip.

## 8. Zoom and navigation

Mobile:

- Pinch to zoom (preserve time under pinch center)
- Two-finger drag to pan while zoomed
- Plus/minus buttons
- Fit full take / selection / trimmed region via auto-fit (on select or trim) and overview double-click (not separate zoom-row buttons)
- Opening a take that already has a non-full retained range fits the view to that trimmed region once (same as fit trimmed region); identity / full-source takes stay at full fit
- Overview navigator strip (required on the take editor); double-click Fit ↔ selection/trim (selection first)

Desktop:

- Mouse wheel/trackpad zoom with Ctrl/⌘ modifier (preserve time under cursor)
- Horizontal scroll / Shift-drag / middle-drag to pan while zoomed
- Zoom buttons (±)
- Fit selection / trimmed region / full take via auto-fit and overview double-click (no Fit / Sel / Trim buttons)
- Overview navigator strip (required on the take editor); double-click Fit ↔ selection/trim (selection first)

The overview strip always shows the full take. Drag the viewport rectangle to pan, drag its edges to zoom, scroll up/down on the strip to zoom (anchored under the pointer), tap outside the viewport to jump. Double-click the strip to Fit full take when zoomed in; when already at full fit, double-click Fits selection if one exists, otherwise Fits the trimmed region if retained bounds exist; otherwise it does nothing.

Zoom must preserve the time position under the pointer or gesture center when practical. Button zoom anchors on selection midpoint, then playhead, then view center.

After a selection gesture completes, the view auto-fits to that selection (same padding as “Fit selection”) — but only when the change is large enough versus the last fitted selection (about 20% of prior selection length on span or either edge), or when the selection has left the comfortable frame of the current view. Micro edge/move nudges after release leave zoom alone. After a trim-edge adjust commits — or retained bounds change via Trim / Collect / Reset / open — the view auto-fits to the retained region (same as “Fit trimmed region”). Auto-fit is suppressed while the corresponding drag is in progress so the wave does not chase the pointer. Working-selection chrome may mirror the selection into retained-range drawing for dimming; that mirror must not drive trim auto-fit (only committed trim / `showTrimGrips` framing does).

While dragging a **trim** or **selection edge grip** near the left or right of the main waveform viewport, the view auto-pans so the grip can keep moving past the visible edge. Scroll tempo scales with zoom (visible span): deeper zoom pans less absolute time per second so visual scroll speed stays consistent.

Single-finger / primary-button drag on the main waveform remains selection (tap seeks). Do not use a Select/Pan mode toggle.

## 9. Playback

Support:

- Play from playhead
- Play selection
- Pause
- Return to selection start
- Loop selection during preview
- Stop at selection end when selection-play mode is active
- **Space** toggles play/pause on the take editor (desktop). Ignore when typing in a field, when focus is on a button/link, or while Field Notes / confirm sheets are open.

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

## 11. Region edit and Collect

### Working region (selection)

The Collect loop uses **selection** as the working region: adjust bounds, apply fades, hear/see auto peak-normalize, then Collect. Domain retained-boundary helpers remain for editing a non-identity child Local File. **MVP UI does not expose a Trim button.**

### Cut

Remove the selected region and concatenate the remaining regions **on the current take**.

Domain support may remain for recipe history, but **MVP UI does not expose Cut** (prefer Collect for multi-sample).

After cutting (if used programmatically):

- Preserve edit history
- Update edited duration
- Recalculate displayed edited waveform from the recipe
- Avoid permanently rendering until export/upload

For MVP performance, the edited overview may be generated from retained source peaks when possible.

### Collect

Create a **new Local File** from the current working selection:

- Requires a usable selection narrower than the full source (same minimum length as before)
- Peak normalize is enabled on the working selection for waveform + playback preview before Collect
- Fades on the selection are included in the collected recipe
- Parent source stays intact; parent recipe resets to full-source identity after Collect
- Child take shares the parent `fileRef` and clones the selection-shaped edit recipe (bounds, fades, normalize, and future recipe ops)
- Child appears in Collection for its own Field Notes; upload starts from Collection only
- Brand primary control in the take transport; stay on parent after success so the next region can be selected and collected
- Primary multi-sample workflow: one field recording → select → fade → Collect repeatedly → upload from Collection
- Parents with collected children are excluded from the default upload-pending set; lone takes without children remain pending

Collect is the intended path when one recording contains multiple useful samples (and for single-region “carve then ship” via one Collect).

## 12. Fade

Support:

- Fade in at beginning of the working selection (or committed retained region when editing a non-identity take)
- Fade out at end of that same region
- Optional fades at internal cut boundaries later

MVP interaction:

- Waveform **fade grips** on the bottom edge of the time ruler (`--ink` wedge tabs); region edge grips use brand selection chrome while collecting, or `--signal` block tabs when editing a committed non-identity recipe
- Drag to set duration; peaks + dashed `--ink` envelope diagonal visualize the linear ramp
- Not exposed as Field Notes sheet Fade in / Fade out actions

MVP curves:

- Linear
- Equal-power optional

Default fade duration is **zero** until the user drags a fade grip. Do not silently add a short fade.

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

Opening an identity take (full source, no committed edits) **defaults** peak-normalize preview on for waveform + playback — same −1 dBFS target as Collect. The user can turn it off with **Normalize** (preview-only until they commit other edits). A usable **selection** also auto-enables peak normalize for waveform + playback preview (and for Collect). The Normalize control reads as **on** (`active` / `aria-pressed`) when peak normalize is enabled — including the default preview and auto-on for a selection (locked on while selecting; not greyed as disabled). Without a selection, **Normalize** toggles preview off or commits normalize on/off for non-identity recipes. Manual Normalize remains available when editing a committed recipe without a selection.

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

Collection upload should default the quality picker to **High (192 kbps MP3)** for faster transfers while keeping WAV options available.

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
- Collect creates a new Local File from the retained trim; parent recipe resets to identity afterward.
- Normalization does not exceed the configured peak target.
- No fake waveform is shown after real audio exists.
