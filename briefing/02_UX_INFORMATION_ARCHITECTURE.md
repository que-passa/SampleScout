# UX and Information Architecture

## 1. Navigation model

### Root and stack

**Capture** is the root / default route — not one of three peer tabs.

Deeper surfaces are a stack with an explicit back control:

1. **Collection** (`/drafts`) — back → Capture
2. **Take detail / editor** (`/take/[takeId]`) — back → Collection
3. **Account** — bottom sheet on mobile, centered modal on desktop (not a primary tab). Open from the shell top-bar Account control (Capture, Collection, Debug) or the Take editor header. OAuth redirect host is `/capture` (matches the Audiotool developer app); `/account` remains an Account overlay deep-link. UI is the overlay, dismissible with close, backdrop, Escape, or history back.
4. **Debug** (`/debug`) — quiet link from Account; back → Capture

Stack navigations use a short directional page transition when the browser supports the View Transitions API: forward (deeper) slides the new page in from the right with a fade; back (shallower) reverses. Same-depth moves fade only. Account overlay keeps its own sheet/modal motion and does not use the stack page transition. Honor `prefers-reduced-motion`.

There is **no** three-tab bottom navigation and **no** persistent Capture / Collection / Account rail.

Collection remains the visible label for `/drafts` (base-path-safe links). Editing stays contextual to a take — never a primary nav item.

### Entry from Capture

Capture’s Collection shortcut (simplified waveform icon + pending count, or a Collection label when empty) is the primary path into Collection. Keep it available whenever not recording so an empty Collection remains reachable for Import.

### Tablet / desktop

Same stack model. Do not reintroduce a primary sidebar of Capture / Collection / Account. Desktop Account is a modal; Collection and Take remain full pages with back chrome. Future upload activity can attach to Collection or a dedicated stack page without becoming a peer tab.

## 2. Primary mobile capture flow

### Entry state

Capture is a single open composition (not a dashboard of panels):

- SampleScout wordmark / logo in the top bar (brand only — no screen titles that duplicate nav)
- Large record control centered and lowered for thumb reach
- Active session title **below** the record control, with clear spacing
- Session rename is click-to-edit: show either the title **or** the input, never both at once
- Capability / storage warnings only when something blocks recording or saving

Capture fills the available viewport (shell top bar fixed; no bottom tab bar). It is **not** a scrollable document — the record control and Field Session sit in a stable lower band (same position idle and while recording); live meters/waveform fill remaining height above while recording. Do not rely on page-level scrolling for Capture.

Do **not** crowd the capture screen with connection chips, storage estimates, developer config, or a recent-takes list. Takes live under **Collection**.

Capture shows a compact **Collection shortcut** to the right of the record control: a simplified waveform icon plus a pending-draft count when > 0, or a Collection label when empty. Tapping it opens Collection at `/drafts`. Hide the shortcut while recording. The shell top-bar Account control (avatar when available) opens the Account sheet/modal on Capture, Collection, and Debug; Take uses the same control in its editor header.

Auth note: the current product gate requires Audiotool connect before the shell; local-only capture without login remains a possible future relaxation.

### Recording state

Show:

- Stop control
- Elapsed time
- **Live scrolling waveform** built from real AnalyserNode min/max peak buckets as the take is captured (canvas, zero axis, ink envelope; `--signal` only while clipping). Full remaining height and edge-to-edge width while recording — no separate panel background, border, or radius. Fixed time/pixel granularity (`LIVE_PEAK_INTERVAL_MS`, currently 10 ms/px): newest energy enters on the right and older buckets scroll off left so the visible segment stays the same length
- Peak/clipping indicator (via waveform treatment)
- Remaining maximum duration
- Cancel option

Keep nonessential navigation visually subdued.

The live capture waveform is provisional measurement from the input analyser — a scrolling window of recent input, not a compressed whole-take overview. After stop, Phase 3 replaces it with worker PCM peaks from the saved source for editing.

### Stopped state

Immediately:

1. Finalize recording chunks.
2. Save the source file to local storage.
3. Create or update the take record.
4. Compute an initial waveform overview asynchronously.
5. Show `Local Draft` only after the OPFS + IndexedDB save gate; supporting copy may say `Saved on this device`.
6. Keep “Record another” prominent (the primary record control returns to idle).
7. Update the Collection shortcut count so the new take is reachable under **Collection**.

Review actions (play, discard, edit, upload) live in **Collection** and the take editor — not as a take list on Capture. To capture again, record a new take; there is no in-place Retake that overwrites an existing Local Draft.

## 3. Field Session behavior

A **Field Session** is the user-facing lightweight grouping mechanism. Internal code and persisted data continue to use `Session` / `CaptureSession`.

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

Default session name:

`Field Session · 25 Jul 2026 · 21:02`

The user may rename it inline.

Starting a new session should not delete or finalize the old session.

## 4. Take stack (Collection)

The take stack lives under **Collection**, not Capture. Show the newest take first within each Field Session.

Each compact row contains:

- Sequence (in the display name)
- Editable name
- Duration
- Kind
- Local/upload state
- Overflow menu (rename); Discard is a visible per-row action with confirmation
- Optional play action where useful

Status language:

- Local Draft (saved on this device only)
- Unreviewed
- Edited
- Ready
- Rendering
- Uploading
- Processing in Audiotool
- Uploaded
- Failed

Do not label a take `Local Draft` or “saved” when only held in JavaScript memory.

## 5. Retake (not supported)

There is no in-place Retake that replaces an existing Local Draft’s audio. If a take is wrong, **Discard** it or leave it and **Capture** a new take. Sequence numbers advance for new recordings as usual.

## 6. Discard flow

1. User taps Discard on a Collection take (visible per-row action), batch Discard in Select mode, or Discard from the take editor Edit sheet.
2. Confirm with an in-app dialog (not the browser/OS alert) before proceeding.
3. Take is removed from the visible stack immediately (batch may remove many).
4. Compact action toast confirms discard (no Undo); batch Discard uses one summary toast.
5. Binary cleanup is scheduled immediately and must be retryable.

Use an in-app confirmation dialog (`ConfirmDialog`) for Collection single discard, take-editor Discard from the Edit sheet, and permanent cleanup such as Delete all local data. Do not use `window.confirm`.

## 7. Extract flow (multi-sample from one recording)

Typical field path: one longer take contains several useful sounds. Extract turns a selection into its own Local Draft without destroying the parent.

1. User opens a saved take (recording or import).
2. Selects a useful region on the waveform.
3. Taps **Extract** (quick action on the take zoom row when a selection exists).
4. App creates a new Local Draft in the same Field Session:
   - Same source binary (`fileRef`) — do not copy OPFS audio for MVP
   - Own edit recipe retaining only the selection
   - Optional `derivedFromTakeId` pointing at the parent
   - Generated name that cites the parent and clock range (e.g. `Parent · 01:23–01:41`)
   - Session defaults / Field Notes prefill like any new take
5. Parent take and its recipe remain unchanged; selection may clear for the next extract.
6. Collection updates so the new draft is visible (count / row). Stay on the parent editor so the user can extract again quickly; offer a quiet toast with an optional open-child action.
7. User repeats for further regions, then opens each draft (or multi-selects in Collection) for Field Notes and upload.

Rules:

- Extract requires a valid selection (same minimum length as trim).
- Extract is not Trim: Trim rewrites the current take’s recipe; Extract adds a Collection item.
- Extract is not Cut: Cut removes material from the current recipe output; Extract leaves the parent timeline intact.
- Discarding an extract removes only that take record (and its rendered assets). Shared source cleanup must not delete the OPFS binary while any take still references it.
- Discarding or retaking the parent must not orphan extracts unsafely: either keep the shared source for remaining children, or block parent discard while extracts exist with a clear explanation (product may choose the softer keep-source path for MVP).
- Do not imply extracts sync across devices or live in the cloud.

## 8. Field Notes metadata flow

Label the existing take metadata/details surface **Field Notes**. On the take editor, Field Notes lives **inside the Edit sheet** (alongside Cut / history / Discard) — not a separate sheet or a control below the waveform. This label does not introduce a new persisted notes field.

Fields:

- Name
- Tags
- Description
- Kind: one-shot/loop
- BPM when loop is selected
- Visibility: private/public (maps to Audiotool `unlisted`/`public`)
- Format: WAV/MP3
- MP3 quality when MP3 is selected
- Estimated output size

Prefill presentation:

- Generated values look like normal editable values.
- Small `AUTO` or `SESSION DEFAULT` labels may explain their source.
- Do not use placeholder text as the actual default.
- A reset-to-suggestion action should be available after manual changes.

## 9. Mobile editor

Use a dedicated full-screen route or overlay — not a bottom sheet. Editing needs vertical space for waveform, zoom, and selection handles.

Structure:

- Header chrome (replaces the global brand bar on this route): Back to Collection (top left, ≥44px), **centered truncated take name** (tap to rename), Account control top right (same as shell top bar)
- Waveform stage: precise waveform sits on page `--paper` (not a boxed pane/card) and uses the available vertical space between header and bottom bar; no redundant “Waveform” label or status header (clock / MONO / SEL facts live in transport + Field Notes inside Edit)
- Overview navigator strip and compact zoom controls (±) pin in the bottom bar above transport
- Pinned bottom transport: Edit (opens edit tools + Field Notes as Account-style bottom sheet on mobile / centered modal on desktop), Play/Pause + clock readout, Upload (opens upload sheet — format, optional prepare encode, Upload to Audiotool)
- Edit sheet keeps **Cut**, **Undo** / **Redo** / **Reset**, **Field Notes**, and **Discard**. **Normalize**, **Trim**, and **Extract** live as quick actions on the zoom row (not duplicated in the sheet). Selection is waveform-only (no numeric sel inputs in the sheet). **Fade in/out** are waveform grips above the take wave. There is no Retake action; capture a new take instead. Successful edit actions and discards show a compact action toast.
- **Extract** is a first-class edit action when a selection exists: create a new Local Draft from the selection without changing the parent recipe
- Do **not** duplicate Capture/Collection links in the footer; stack back chrome covers navigation

MVP `/take/[takeId]` follows this: editor header with top-left back → `/drafts` labeled Collection, centered filename, and top-right Account; waveform-first stage filling available height; pinned bottom bar (zoom/nav + transport); **Field Notes** lives inside the Edit sheet (not a separate trigger below the waveform). No primary bottom tabs; hide the SampleScout brand/top bar while on the take route (Account stays in the editor header).

**Viewport-locked instrument chrome:** header and transport stay **pinned**. Only the middle workspace body scrolls. Do not scroll the header or transport away with the take content. Respect `env(safe-area-inset-bottom)` on the transport bar.

Mobile interaction rules:

- Minimum practical touch target: 44 × 44 CSS px
- Selection handles must have larger invisible hit areas than their visible stroke
- Pinch zoom is supported; plus/minus zoom controls remain available
- Overview navigator strip is required on the take editor
- Long press is not required for essential actions
- No hover-only controls
- Avoid horizontal page scrolling
- Waveform may scroll horizontally only while zoomed

## 10. Desktop workspace

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

## 10b. Account view

Account is a **sheet (mobile) / modal (desktop)** over the current screen — not a peer tab.

User-facing content only:

- Signed-in identity (display name / username)
- Connect / Disconnect
- Honest local-data copy (no cloud backup, no cross-device sync)
- Delete all local data

Open from the shell top bar on Capture / Collection / Debug (Audiotool avatar when available, accessible “Account” label) or the Take editor header. OAuth returns to `/capture`; route `/account` is an overlay deep-link and shows the same Account UI.

Developer diagnostics (full capability report, MIME support) live on a separate **Debug** screen (`/debug`), linked quietly from Account — not on the Account surface itself. OAuth client ID, redirect URI, scopes, and app-registration copy are not shown in the UI; they stay in `.env` / docs only.

## 11. Collection view (`/drafts`)

Show Field Sessions by default. Recent takes are reviewed here, not on Capture.

Shell top bar (shared with Capture/Debug): back → Capture, page title **Collection**, Account control top right. Pin **Select** and **Import** in a bottom actions bar (always visible; does not scroll away with the list). Do not duplicate back, title, or Account in the scrollable body. Field Session group headings use the session name only — do not add a separate “Field Session” type label above names that already include that phrase (default: `Field Session · …`).

Use catalog rhythm, stable indexing, and deterministic specimen marks to make accumulating recordings satisfying without turning records into collectible cards. A specimen mark is derived from persisted take/source facts and remains stable for those facts. It is not a waveform, audio fingerprint, quality score, rarity tier, or random decoration. Do not add XP, streaks, celebratory motion, or cloud implications.

Session row/card:

- Name
- Last updated
- Take count
- Total duration
- Local size
- Upload summary

Within a session, show takes with:

- Waveform
- Name (sequence is part of the display name — no leading sequence column)
- Duration
- Type
- Status
- Selection checkbox
- Overflow menu (rename); Discard is a visible per-row action with confirmation

Clicking the take row opens the take detail. Actions stay in the overflow menu only.

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

## 12. Empty, error, and permission states

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

## 13. Responsive breakpoints

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
