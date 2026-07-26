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
- Local drafts use browser storage.
- The UI is bright, black/white/neutral gray, technical, precise, and primarily monospaced.
- Waveforms must be calculated from real audio and rendered precisely.
- Do not use a generic or decorative waveform.
- Default Audiotool visibility is `unlisted`.
- Default sample kind is `one-shot`.
- Recommended hard maximum is 10 minutes per take.
- Visible vocabulary: Capture action; Collection destination at `/drafts`; Field Session grouping; Field Notes for existing take metadata/details; **Extract** for selection → new Local Draft.
- `Local Draft` means saved on this device only after the OPFS + IndexedDB commit gate.

Before adding dependencies, explain what each dependency is needed for. Prefer browser APIs and small focused libraries.

## Product behavior

A user can:

1. Connect Audiotool through the current auth splash, then enter the app. A future local-only relaxation must not be assumed.
2. Record a take through the phone microphone (including longer multi-sound field captures within the take limit).
3. Stop and have the take saved locally automatically.
4. Immediately record another take.
5. Leave any take unreviewed for later.
6. Open a take, select useful regions, and **Extract** each as its own Local Draft while the parent recording stays intact.
7. Discard a bad take or Capture a new one (no in-place Retake).
8. Discard a take with a temporary Undo.
9. Import an existing audio file.
10. View an accurate waveform.
11. Trim, cut, fade, and peak-normalize non-destructively on a draft.
12. Review prefilled metadata (Field Notes).
13. Upload WAV or MP3 directly to Audiotool.
14. Close and reopen the app and recover saved local takes.

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

Do not add rarity, XP, streaks, collectible cards, celebratory collection motion, or cloud/sync implications.

## Initial routes

```text
/
  Redirect or render Capture

/capture
  Minimal capture composition: record control + click-to-edit session title

/drafts
  Collection (Field Sessions and takes; route remains /drafts)

/take/[takeId]
  Editor and metadata

/account
  Audiotool identity, disconnect, local-data wipe

/debug
  Developer diagnostics (capability report only; no OAuth secrets/config display)
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

A take can be labeled `Saved locally` only after the binary and its metadata record have been committed successfully.

Present that state as `Local Draft` with supporting device-local copy. Keep the existing lifecycle enum; do not add a cloud-like draft state.

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

## Retake (removed)

There is no in-place Retake. Capture a new take or Discard the old one. Do not replace an existing Local Draft’s source while preserving its sequence.

## Discard

Discard is optimistic:

- Hide take immediately.
- Show Undo.
- Mark file for cleanup after timeout.
- Cleanup is persistent and retryable.

## Field Notes and metadata defaults

**Field Notes** labels the existing take details/metadata surface. It does not add a new persisted notes field. On `/take/[takeId]`, Field Notes is a section inside the Edit sheet (not a separate sheet below the waveform).

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

Collection specimen marks are separate deterministic catalog identities derived from persisted take/source facts. They are not waveforms, audio fingerprints, quality scores, or random decorative waveform; never use them in place of the PCM-derived waveform.

## Editor

Non-destructive recipe:

- Retained source segments
- Boundary fades
- Gain
- Peak normalization

Tools:

- Extract (selection → new Local Draft; parent unchanged; shared source)
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
- Collection shortcut from Capture when local drafts exist
- Newest takes first within each Field Session in Collection
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
- Catalog rhythm, stable indexing, and compact deterministic specimen marks in Collection

Avoid:

- Dark-first interface
- Gradients
- Glassmorphism
- Neon
- Excessive rounded cards
- Decorative animation
- Cartoon waveform
- Generic dashboard templates
- Rarity, XP, streaks, collectible cards, celebratory collection motion, or cloud implications

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
