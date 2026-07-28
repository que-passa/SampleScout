# UX and Information Architecture

## 1. Navigation model

### Root and stack

**Capture** is the root / default route — not one of three peer tabs.

Deeper surfaces are a stack with an explicit back control:

1. **Collection** (`/collection`) — back → Capture
2. **Take detail / editor** (`/take/[takeId]`) — back → Collection
3. **Account** — bottom sheet on mobile, centered modal on desktop (not a primary tab). Open from the shell top-bar Account control (Capture, Collection, Debug). OAuth redirect host is `/capture` (matches the Audiotool developer app); `/account` remains an Account overlay deep-link. UI is the overlay, dismissible with close, backdrop, Escape, or history back.
4. **Debug** (`/debug`) — quiet link from Account; back → Capture

Stack navigations use a short directional page transition when the browser supports the View Transitions API: forward (deeper) slides the new page in from the right with a fade; back (shallower) reverses. Same-depth moves fade only. Account overlay keeps its own sheet/modal motion and does not use the stack page transition. Honor `prefers-reduced-motion`.

There is **no** three-tab bottom navigation and **no** persistent Capture / Collection / Account rail.

Collection remains the visible label for `/collection` (base-path-safe links). Editing stays contextual to a take — never a primary nav item.

### Entry from Capture

Capture’s Collection shortcut (simplified waveform icon + zero-padded **total** Local File count, including `00` when empty, with a **signal** **pending** bubble above the total when upload-pending files exist) is the primary path into Collection. Keep it available whenever not recording so an empty Collection remains reachable for Import.

### Tablet / desktop

Same stack model. Do not reintroduce a primary sidebar of Capture / Collection / Account. Desktop Account is a modal; Collection and Take remain full pages with back chrome. Future upload activity can attach to Collection or a dedicated stack page without becoming a peer tab.

## 2. Primary mobile capture flow

### Entry state

Capture is a single open composition (not a dashboard of panels):

- SampleScout wordmark / logo in the top bar (brand only — no screen titles that duplicate nav)
- Large record control centered and lowered for thumb reach
- Active session title **below** the record control, with clear spacing
- Session rename: tap the title to open a **bottom sheet** (input + suggestion chips). Do not use inline click-to-edit on Capture.
- Capability / storage warnings only when something blocks recording or saving

Capture fills the available viewport (shell top bar fixed; no bottom tab bar). It is **not** a scrollable document — the record control and Field Session sit in a stable lower band (same position idle and while recording); the plot stage fills remaining height above. Idle shows a standby plot frame (zero axis, edge ticks, decoration label in the timer header slot, slow right→left scan — no fake waveform; header height matches Capture timer so the axis aligns with the live wave; respect `prefers-reduced-motion`). The idle header label is `STANDBY` when capture is armed; once capabilities report recording unavailable it switches to `NO MIC` (detail + Import still live in the capability overlay banner). While recording, the same stage shows the live meters/waveform. Do not rely on page-level scrolling for Capture.

Do **not** crowd the capture screen with connection chips, storage estimates, developer config, or a recent-takes list. Takes live under **Collection**.

Capture shows a compact **Collection shortcut** to the right of the record control: a simplified waveform icon, a zero-padded **total** Local File count (including `00` when empty), and a **signal** **pending** bubble (record red fill, bright numerals) stacked above the total when any upload-pending files exist (same pending set as Collection Upload). Tapping it opens Collection at `/collection`. Hide the shortcut while recording. The shell top-bar Account control (avatar when available) opens the Account sheet/modal on Capture, Collection, and Debug. Take has no Account control in the editor header.

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
5. Show `Local File` only after the OPFS + IndexedDB save gate; supporting copy should make clear it is not uploaded and only on this device (e.g. `Not uploaded. Only on this device.`).
6. Keep “Record another” prominent (the primary record control returns to idle).
7. Update the Collection shortcut counts (total + pending bubble) so the new take is reachable under **Collection**.
8. Confirm outcomes with a compact action toast (successful capture with optional **Open**, cancel/discard, not-saved, import). Do **not** leave sticky outcome lines under the Field Session title.

The Capture status slot under the session title is **in-flight only** (`Checking storage…`, `Requesting mic…`, `Recording…`, `Past 5 min`, `Saving…`, `Canceling…`). Capability / storage blockers stay as overlay banners. Idle hydrate does not announce `Ready.` / `Restored…` in that slot.

Review actions (play, discard, edit) live in **Collection** and the take editor; **upload** starts only from Collection — not as a take list on Capture. To capture again, record a new take; there is no in-place Retake that overwrites an existing Local File.

## 3. Field Session behavior

A **Field Session** is the user-facing lightweight grouping mechanism for a continuous capture window. Collection treats it as a temporary group of Local Files to prepare and upload — not a reopenable long-term folder. Internal code and persisted data continue to use `Session` / `CaptureSession`.

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

Default session name: **`Session`**. Datetime is **not** part of the name; Collection shows session datetime as metadata (`dd/mm`) beside the file count.

**Capture session name sheet** (tap title):

- Text input at the top (current name); **Done** commits (empty → `Session`) and closes.
- Below: up to **12 user presets** (custom names remembered on this device, newest first, FIFO) then ~**21 built-in** location/activity chips (e.g. Atmo, Walk, Home, Forest, Beach, City…).
- On mobile / narrow viewports, do **not** autofocus the input (keyboard would cover chips). Desktop may autofocus + select for quick typing. Tap the field when typing is needed.
- Tap a chip **applies that name and closes** the sheet.
- User chips are visually distinct from built-ins. Case-insensitive match to a built-in does not create a duplicate user pill.
- **If the active session already has Local Files**, applying a _different_ name **seals** that session (`inactive`) and starts a **new** active session with the chosen name. Existing files stay under the previous session group in Collection. Capture cannot record into sealed sessions.
- **If the active session is empty**, the name is updated in place (no empty sealed group).
- Applying the same name is a no-op. Changing the session title never rewrites existing take display names.

**Capture settings sheet** (gear icon left of Record when idle):

- Opens a bottom sheet with **Recording** and **Upload** sections.
- Recording: channels, sample rate, encoder bitrate — each is a **request** to the browser/device; copy must say actual capture may differ.
- Upload: export quality for Audiotool (same presets as Collection upload confirm; default **192 kbps MP3**). This is a **hard** app setting applied at encode time.
- Disabled while recording / finalizing / requesting mic. Discard replaces the gear on the left while recording.

## 4. Take stack (Collection)

The take stack lives under **Collection**, not Capture. Show the newest take first within each Field Session. Newest / most recently updated Field Session groups appear first.

Each compact row contains:

- Sequence (in the display name)
- Editable name
- Duration
- Kind
- Local/upload state
- Overflow menu (rename); Discard is a visible per-row action with confirmation
- Optional play action where useful

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

Do not label a take `Local File` or “saved” when only held in JavaScript memory.

## 5. Retake (not supported)

There is no in-place Retake that replaces an existing Local File’s audio. If a take is wrong, **Discard** it or leave it and **Capture** a new take. Sequence numbers advance for new recordings as usual.

## 6. Discard flow

1. User taps Discard on a Collection take (visible per-row action), select-mode **Discard** after multi-select, or Discard from the take editor Field Notes sheet.
2. Confirm with an in-app dialog (not the browser/OS alert) before proceeding.
3. Take is removed from the visible stack immediately (batch may remove many).
4. Compact action toast confirms discard (no Undo); batch Discard uses one summary toast.
5. Binary cleanup is scheduled immediately and must be retryable.

Use an in-app confirmation dialog (`ConfirmDialog`) for Collection single discard, take-editor Discard from the Field Notes sheet, and permanent cleanup such as Delete all local data. Do not use `window.confirm`.

## 7. Collect flow (multi-sample from one recording)

Typical field path: one longer take contains several useful sounds. **Collect** turns the current **working selection** (with fades + auto peak-normalize) into its own Local File without destroying the parent source. There is no separate Trim step. Single-region and multi-region cases use the same primary control (once vs repeatedly).

**Suggested Regions** (see [`11_SUGGESTED_REGIONS.md`](11_SUGGESTED_REGIONS.md)) may auto-propose rough source ranges on takes longer than 3 s (energy-island analysis). Action-row **left** shows `collection` icon + **`N scouted`**; tapping engages (selects first, label → `01/N`, reveals **Next**, shows muted scouted markers on the wave). Applying a suggestion sets **selection only**. Empty/fail hides that chrome. After Collect, the suggestion list for the open take is kept (no re-analyze). Manual Trim → Collect remains the authority.

1. User opens a saved take (recording or import).
2. Adjusts the selection; applies fades on the selection; peak normalize is on for the selection so preview matches Collect.
3. Taps **Collect** (brand primary in the take bottom bar; enabled when a usable selection is narrower than the full source).
4. App creates a new Local File in the same Field Session:
   - Same source binary (`fileRef`) — do not copy OPFS audio for MVP
   - Own edit recipe cloned from the working selection (bounds, fades, normalize, and future recipe ops)
   - Optional `derivedFromTakeId` pointing at the parent
   - Generated short name: stem + two-digit number (e.g. `Rain 01`); never em/en dashes
   - Session defaults / Field Notes prefill like any new take
5. Parent source stays intact; parent recipe returns to full-source identity so the next region can be selected and collected. Temporary selection and selection fades clear.
6. Collection updates so the new file is visible (count / row). Stay on the parent editor so the user can Collect again quickly; offer a quiet toast with an optional open-child action.
7. User repeats for further regions, then ships from **Collection** (confirm upload sheet). Parents with collected children are excluded from the default upload pending set; lone takes without children remain pending.

Rules:

- Collect requires a usable working selection (narrower than the full source; same minimum length as before). Fades on that selection are included.
- There is no Trim step: Collect commits the selection-shaped recipe into a new Local File, then restores the parent recipe to identity.
- Collect is not Cut: Cut removes material from the current recipe output; Collect leaves the parent source timeline available for further Collects.
- Discarding a collected file removes only that take record (and its rendered assets). Shared source cleanup must not delete the OPFS binary while any take still references it.
- Discarding the parent must not orphan children unsafely: keep the shared source for remaining children (MVP).
- Do not imply collected files sync across devices or live in the cloud.
- Do not start upload from the take editor.

## 8. Field Notes metadata flow

Label the existing take metadata/details surface **Field Notes**. On the take editor, Field Notes is its **own sheet** (opened from the transport Field Notes icon; Discard lives at the bottom). This label does not introduce a new persisted notes field.

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

**Tags editor** (Field Notes, batch Field Notes, Collection upload confirm):

- Token field: committed tags render as inline removable pills; a text input captures the next tag.
- Commit with comma, Enter, or blur; comma is not shown. Backspace on an empty input removes the last tag. Click a committed pill to remove it.
- Below the field: up to **12 remembered recent tags** on this device (newest first, FIFO), then **built-in preset chips** (sample-identity slugs such as `foley`, `hihat`, `metal`, `soft`, …). Recent chips use brand-soft fill; built-ins use surface — same language as Capture session-name chips but **smaller** (`--text-meta` for in-field tokens and suggestion chips).
- Tap a suggestion chip to **append** that tag (does not replace the whole list). Already-selected tags hide from suggestions.
- Persist recent tags when Field Notes are saved, batch-applied, or upload overlay is confirmed.

## 9. Mobile editor

Use a dedicated full-screen route or overlay — not a bottom sheet. Editing needs vertical space for waveform, zoom, and selection handles.

Structure:

- Header chrome (replaces the global brand bar on this route): Back to Collection (top left, ≥44px), **centered truncated take name** (tap to rename), **Reset edits** icon top right (when recipe is non-identity). No Account control on Take — open Account from Capture / Collection / Debug.
- Waveform stage: precise waveform sits on page `--paper` (not a boxed pane/card) and uses the available vertical space between header and bottom bar; no redundant “Waveform” label or status header (positional time lives on the waveform ruler; duration / channel / selection facts live in Field Notes — no separate playhead clock in transport)
- Overview navigator strip and compact zoom controls (±) pin in the bottom bar above transport
- Pinned bottom bar: wave chrome (zoom + overview) → transport row (`PlaybackControl` center, Loop right) → action row (**Scouted** left when available — icon + `N scouted`, then `01/N` + **Next** after engage; **Field Notes** icon immediately left of **Collect** brand primary on the right). No Upload on take — shipping is Collection-only.
- Field Notes sheet holds metadata/details and **Discard**. No Cut, Undo, Redo, or Trim in the UI. **Reset** lives in the editor header (not the sheet). **Gain**, **Rumble** (high-pass), **Limit**, **Gate**, and **Normalize** live as compact actions on the waveform chrome row: Gain/Rumble/Limit/Gate lock while a selection is active; Normalize auto-on while selecting (latched on, not greyed). Without a selection, Normalize toggles the committed recipe. Selection is waveform-only (no numeric sel inputs in the sheet). **Fade in/out** are waveform grips on the working selection (or on the committed recipe when editing a non-identity child). There is no Retake action; capture a new take instead. Successful edit actions, Collect, and discards show a compact action toast.
- **Collect** is the primary commit when a usable selection exists: create a new Local File from selection bounds + fades + normalize, restore parent recipe to identity, stay on the parent for another Collect
- Do **not** duplicate Capture/Collection links in the footer; stack back chrome covers navigation

MVP `/take/[takeId]` follows this: editor header with top-left back → `/collection` labeled Collection, centered filename, and top-right Reset; waveform-first stage filling available height; pinned bottom bar (zoom/nav + transport); **Field Notes** opens from the transport icon button. No primary bottom tabs; hide the SampleScout brand/top bar while on the take route (no Account in the editor header).

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
- **Install / Add to Home Screen** when the app is not already running standalone: Chromium uses the deferred `beforeinstallprompt` native dialog; iOS / iPadOS shows a short Share → Add to Home Screen sheet (no fake one-tap install). Hidden after install, dismissal (`Not now`), or `localStorage` dismiss flag.
- Honest local-data copy (no cloud backup, no cross-device sync)
- Delete all local data

A soft action-toast tip (“Add to Home Screen…”) may appear once after the first Local File exists (delayed so it does not fight Capture save feedback). It does not block Capture.

Open from the shell top bar on Capture / Collection / Debug (Audiotool avatar when available, accessible “Account” label). OAuth returns to `/capture`; route `/account` is an overlay deep-link and shows the same Account UI.

Developer diagnostics (full capability report, MIME support) live on a separate **Debug** screen (`/debug`), linked quietly from Account — not on the Account surface itself. OAuth client ID, redirect URI, scopes, and app-registration copy are not shown in the UI; they stay in `.env` / docs only.

## 11. Collection view (`/collection`)

Show Field Sessions by default as **visual groups**: each session is a header band plus nested Local File / take rows. Recent takes are reviewed here, not on Capture.

Shell top bar (shared with Capture/Debug): back → Capture, page title **Collection**, Account control top right. When the Collection has Local Files, pin actions in a bottom bar (does not scroll away with the list). When empty, omit the bottom bar — Import and Capture live only in the empty state.

**Default bottom bar:** **Select** (text), then **Import** and **Cleanup** as icon-only ghosts (`aria-label`) on the left; **Upload** (brand primary text) alone on the right — icon density so the bar fits narrow phones. **Cleanup** removes every Local File with `uploadState === 'uploaded'` from this device after confirm (Audiotool copies stay). If none are uploaded, show a neutral toast `Nothing to clean up` instead of opening confirm. Upload opens a confirm bottom sheet for every **upload-pending** Local File — saved, not yet uploaded, and with **no collected children**. Do not instantly queue. Do not duplicate back, title, or Account in the scrollable body. Collection action feedback (import, discard, cleanup, Field Notes, empty Upload, queue failures) uses compact action toasts only — no sticky status/error lines in the list.

**Select mode bottom bar:** **Done**, then **Edit data**, **Discard**, and **Upload** (selected ∩ upload-pending only). Those three stay disabled until at least one take is selected. Import is hidden while selecting. Do not add a separate “Field Session” type label above session names that already include that phrase.

### Field Session group header

Each session block header:

| Left                                                                                 | Right                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Session **name** (stored title; may still contain a dated default until naming work) | **`N files`** + session date as **`dd/mm`** (from `createdAt`; single day for MVP) |

In **Select** mode, a checkbox precedes the session name and selects or deselects every take in that Field Session (same visual as take-row checkboxes). Take / Local File rows sit under that header. Session datetime is metadata on the right — do not treat the dated portion of the default name as the Collection time chrome.

### Collection upload sheet

1. **Confirm phase:** top visual preview of marked items (specimen marks + names + total count); below, metadata overlay (title stem, description, tags) extending session defaults; **Cancel** left, **Upload** (brand primary) right.
2. On confirm: apply overlay (regenerate `Stem 01`… for the batch in order; description/tags on all), then enqueue encode + Audiotool upload using each take’s saved output settings.
3. **Progress phase:** same sheet swaps to progress-only (k of N, current name, status); not dismissible while jobs are active; Cancel cancels in-flight where supported.
4. Partial failure is honest; row Retry remains on Collection. Success uses the existing compact action toast.

Multi-select flow:

1. Tap **Select**.
2. Choose takes (row checkboxes; Field Session header checkbox selects/deselects that session; Select all / Clear in the list header).
3. Choose an action:
   - **Edit data** — opens a sheet with batch Field Notes (only checked fields apply).
   - **Discard** — confirm, then remove selected Local Files from this device.
   - **Upload** — open the confirm sheet for selected upload-pending files.
4. Tap **Done** to leave select mode (clears the selection).

Do not show the batch Field Notes form inline as soon as a row is checked — it opens only via **Edit data**.

Use catalog rhythm, stable indexing, and deterministic specimen marks to make accumulating recordings satisfying without turning records into collectible cards. A specimen mark is derived from persisted take/source facts and remains stable for those facts (grid pattern and neon fill). It is not a waveform, audio fingerprint, quality score, rarity tier, or random decoration. Do not add XP, streaks, celebratory motion, or cloud implications.

Session group (header + nested takes):

- Name (left)
- File count + `dd/mm` from session `createdAt` (right)
- Nested take rows below (newest first within the session)

Within a session, show takes with:

- Waveform
- Name (sequence is part of the display name — no leading sequence column)
- Catalog reference with short capture date/time beside it (e.g. `FS-…-003 27/07/17:41`)
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

Bulk actions (after Select → choose takes):

- Edit data (batch Field Notes: tags, description, kind, visibility, BPM)
- Upload (selected ∩ upload-pending → confirm sheet)
- Discard

Outside select mode, **Upload** opens the confirm sheet for the full upload-pending Collection (Local Files not yet uploaded and without collected children). **Cleanup** (confirm) deletes already-uploaded local audio files from this device; empty cleanup shows toast `Nothing to clean up`.

## 12. Empty, error, and permission states

### Collection empty

Centered in the Collection content area (no panel border/background): title **Collection is empty**, actions **Import** then **Capture**. No bottom action bar, no supporting body copy, no “Empty” eyebrow, and no Local File legend until at least one session exists.

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
