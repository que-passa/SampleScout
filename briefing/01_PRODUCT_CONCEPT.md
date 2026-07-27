# Product Concept

## 1. Product definition

**SampleScout** is a responsive web app and installable PWA for capturing real-world audio and sending prepared samples to Audiotool.

The primary use case is a person in the field with a phone capturing real-world audio. That often means **one longer recording that contains several useful samples** (atmo, textures, hits in a row), not only isolated one-shot taps. Users also record several independent takes in one Field Session. In both cases they must be able to stop, leave material untouched, and begin another take immediately — then later review and carve out upload-ready samples.

The product supports:

- Mobile microphone recording (including longer multi-sound captures within the take limit)
- Multiple independent takes in a Field Session
- **Collect:** turn retained trims of one recording into multiple Local Files (parent source intact); upload from Collection
- A device-local Collection of files
- Immediate discard; capture a new take instead of in-place retake
- File import
- Trim, cut, fade, and normalization on a per-file recipe
- Metadata defaults and batch editing
- WAV and MP3 output
- Direct Audiotool authentication and upload (Collection confirm sheet → progress)

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

**Capture** names the action, not a storage destination. Saved takes are found in the visible **Collection** destination at `/collection`.

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

Collected files are full takes in this sense: independent Field Notes and upload state. They may **share** the parent’s source binary (same OPFS `fileRef`) while keeping a distinct retain recipe. Collect is not the same as Trim: Trim changes one take’s recipe; Collect creates another Local File from that trim result and restores the parent recipe to identity so further regions can be collected.

**Upload pending:** a Local File is in the default upload set when it is not yet uploaded **and** it has no collected children (`derivedFromTakeId` pointing at it). Lone takes remain uploadable; parents with children are source-only for shipping until children are discarded.

### 3.3 No in-place Retake

Do not replace an existing Local File’s audio via a Retake action. If a take is wrong, Discard it (with undo) or leave it and Capture a new take. Sequence numbers advance for new recordings as usual.

### 3.4 Discard should be fast but reversible

Discard removes the take from the working list immediately and presents an Undo action.

The actual binary file should not be permanently deleted until the Undo period expires or the cleanup job confirms deletion.

### 3.5 Metadata should start useful

Avoid empty fields wherever a responsible default exists.

Default metadata:

- **Name:** short stem + two-digit number (`Rain 01`). Never use em/en dashes (`—` / `–`) in generated names. Numbering continues while the stem matches the previous numbered name in the session; resets to `01` when the stem changes.
- **Tags:** session tags, recent tags, preset tags, or `recording`
- **Description:** generated session/take context
- **Kind:** one-shot
- **Visibility:** Private (Audiotool `unlisted`)
- **Format:** WAV unless the user selects compact MP3
- **BPM:** unset unless loop mode or user input supplies it

Generated metadata remains visibly editable. On Collection upload, session defaults may be extended by a per-batch overlay for title stem, description, and tags.

Default Field Session title is **`Session`** (datetime is Collection metadata, not part of the name). Capture renames via a bottom sheet with location/activity presets and remembered custom pills.

In the UI, the existing metadata/details surface is labeled **Field Notes**. This is vocabulary only: do not add a separate persisted notes field.

### 3.6 Local-first, not permanent storage

Every stopped take is stored locally to survive:

- Network loss
- Delayed review
- Navigation
- Closing and reopening the app
- Upload failure

However, local browser storage is not presented as cloud backup.

**Local File** means saved on this device only. It is not a cloud, sync, ownership, or upload state, and it must not appear before both the OPFS binary write and IndexedDB metadata commit succeed.

The app must state clearly:

- Clearing site data removes files.
- Private browsing may remove data at the end of the session.
- Files do not sync across devices.
- Closing the app may stop an active upload.

### 3.7 Simple interface, deep capability

The common field path should be obvious:

`Record → Stop → Record another`

The common review path for multi-sound captures should be equally clear:

`Open take → Trim region → Collect → (repeat) → Collection → Upload`

Single-region shape stays progressive:

`Review → Trim / Fade → Collect (optional) → Collection → Upload`

Upload never starts from the take editor; Collection owns confirm → progress.

### 3.8 Collection identity is bounded

The Collection may feel like a field catalog through stable indexing, deliberate record rhythm, and deterministic specimen marks derived from persisted take/source facts. Marks are catalog identities—not audio waveforms, fingerprints, quality scores, rarity indicators, or random decorative waveform shapes.

Do not add XP, streaks, collectible cards, celebratory motion, or language that implies cloud storage. Internal engineering keeps `Session` and `Take`; the UI may present session groups as **Field Sessions**.

## 4. Primary personas

### Mobile sound collector

Captures doors, machines, ambience, impacts, voices, textures, and environmental sounds while moving around — often as longer continuous takes that later yield several samples.

Needs:

- Very fast repeated capture
- Comfortable longer takes (within the take limit)
- Strong outdoor readability
- Reliable local files
- Collect multiple samples from one recording
- Minimal typing
- Clear recording state

### Producer collecting one-shots

Records percussion, object hits, foley, and short tonal sounds — either as discrete takes or as regions collected from a longer pass.

Needs:

- Fast Capture of another take
- Collect from retained trim
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

Returns later on desktop to organize and upload recordings made on mobile — including collecting several samples from longer field takes.

Needs:

- Dense but controlled overview
- Keyboard support
- Fast Collect from retained trim
- Batch metadata
- Larger waveform editor
- Upload queue

Files remain device-local. A phone’s local files do not automatically appear on desktop.

## 5. Product scope

### MVP

- Audiotool OAuth login
- Mobile recording
- Multiple takes
- Field Session grouping (internal `Session`)
- Automatic local save
- Discard with Undo
- File import
- Accurate waveform
- Collect retained trim as a new Local File (shared source, parent intact)
- Trim
- Cut
- Fade in/out
- Peak normalization
- Metadata defaults
- One-shot/loop
- BPM for loops
- Private/public (UI Private maps to Audiotool `unlisted`)
- WAV output
- MP3 output through client-side encoding
- Direct Audiotool upload from Collection (confirm sheet → progress)
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
- Discard error recovery
- Editing completion time
- Crash-free 10-minute recording and render rate
