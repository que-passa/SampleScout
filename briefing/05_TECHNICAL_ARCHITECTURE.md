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

### Product vocabulary versus domain vocabulary

The UI labels the `/collection` destination **Collection**, session groups **Field Sessions**, and the existing metadata/details surface **Field Notes**. Keep `Session`, `CaptureSession`, `Take`, `TakeMetadata`, and table names unchanged internally. Legacy `/drafts` redirects to `/collection`. Do not add a persisted notes field for the Field Notes label.

`Local File` is a presentation status for a take that passed the existing OPFS source + IndexedDB metadata commit gate; it is not a new lifecycle state. A specimen mark is a deterministic projection of already-persisted take/source facts and does not require audio analysis, fingerprinting, scoring, randomness, or a new binary asset.

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
→ mark Saved locally
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
