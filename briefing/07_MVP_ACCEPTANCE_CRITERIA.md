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
- UI does not show “Saved locally” before persistence succeeds.
- `Local File` is shown only after the OPFS source and IndexedDB metadata commits succeed, with device-local meaning clear.
- User can record another take immediately.
- Three or more takes remain independently playable.
- App restart restores takes and session order.
- Ten-minute auto-stop works.
- Low-storage condition blocks unsafe recording with a clear explanation.

## 3. Phase 2 — Take management

### Acceptance criteria

- Newest take appears first on mobile.
- Inline rename works.
- There is no in-place Retake; users Capture a new take or Discard the old one.
- Discard removes take immediately.
- Discard Undo restores take.
- Expired discard removes binary through cleanup.
- Cleanup failures remain retryable.
- Session rename and defaults affect new takes only unless user applies them in bulk.
- The UI presents groups as Field Sessions while internal `Session` behavior remains unchanged.

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
- Fade in and fade out affect rendered output.
- Peak normalization reaches target without exceeding it.
- Reset (header control) restores the identity recipe.
- Source file remains unchanged.
- Edited recipe survives restart.
- Editor releases large decoded buffers after exit.
- Cut / Undo / Redo are not required in the take editor UI for MVP.

## 6. Phase 4b — Collect (multi-sample from one recording)

### Acceptance criteria

- With a usable retained trim (narrower than the full source), Collect creates a new Local File in the same Field Session.
- Parent source binary remains shared/intact; parent recipe returns to full-source identity after Collect so further regions can be trimmed.
- Collected take shares the parent source binary (`fileRef`) and clones the selection-shaped edit recipe (bounds, fades, normalize, and future recipe ops).
- Collected take appears in Collection with its own Field Notes; upload starts from Collection only (no Upload on take).
- Collect is a brand primary in the take transport; it depends on trim result state, not a temporary waveform selection. User can Collect multiple regions from the same parent without leaving the parent editor.
- Discarding a collected file does not delete the shared OPFS source while the parent (or another child) still references it.
- Display names use short stem + two-digit number with no em/en dashes; lineage may be surfaced honestly (e.g. collected-from) without implying cloud sync.
- Parents with collected children are excluded from the default upload-pending set; lone takes without children remain upload-pending.

## 6b. Collection upload sheet

### Acceptance criteria

- Collection Upload does not instantly queue; it opens a confirm sheet with marked-item preview (marks + count) and metadata overlay (stem, description, tags).
- Confirm applies overlay then enqueues; sheet switches to locked progress (k of N / status) until done/fail/cancel.
- Select-mode Upload uses the same sheet for selected ∩ upload-pending only.

## 7. Phase 5 — Metadata

### Acceptance criteria

- Every new take has a generated name (short stem + `01`-style number; no em/en dashes).
- Every new take has at least one usable tag or falls back safely.
- Description is prefilled and editable.
- One-shot is default.
- Loop reveals BPM field.
- Unlisted is default.
- Public requires deliberate selection.
- Batch metadata applies to selected takes.
- Manual overrides are not overwritten by later session-default changes.
- Source of generated/default metadata can be understood by the user.
- Existing take metadata/details is labeled Field Notes without adding a persisted notes field.

## 8. Phase 6 — Export

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

## 9. Phase 7 — Audiotool upload

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

## 10. Phase 8 — Responsive and accessible UI

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
- Collection is reached from Capture (shortcut / stack), labeled Collection while the route is `/collection`; no three-tab primary nav.
- Collection uses stable indexing/catalog rhythm and may use deterministic, data-derived specimen marks.
- Account opens as a mobile bottom sheet / desktop modal; `/account` remains the OAuth redirect host.
- Specimen marks are visibly distinct from real waveforms and do not imply fingerprinting, quality, rarity, cloud storage, XP, or streaks.
- No collectible-card treatment or celebratory collection motion.

## 11. Definition of done

A feature is done only when:

- Domain behavior is tested.
- Persistence behavior is tested.
- Error state is designed.
- Keyboard and touch behavior are considered.
- Restart/recovery behavior is known.
- No-backend constraints are respected.
- Browser support assumption is documented.
