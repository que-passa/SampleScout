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

- Use `Local File` with supporting copy that it is not uploaded and only on this device.
- Show storage origin/device language.
- Explain clearing browser data.
- Offer delete-after-upload preference.
- Avoid cloud icons for local save.

### Catalog identity is mistaken for audio analysis or gamification

Mitigation:

- Derive specimen marks deterministically from persisted take/source facts only.
- State that marks are not waveforms, audio fingerprints, quality scores, or rarity.
- Keep real waveform generation unchanged and PCM-derived.
- Limit delight to catalog rhythm and indexing; no XP, streaks, collectible cards, celebratory motion, or cloud implications.

### Suggested Regions are mistaken for “AI found the samples”

On-device envelope/onset heuristics can over-promise if copy or chrome implies taste, quality, or guaranteed crops.

Mitigation:

- Frame as rough suggested cuts only; selection → Trim → Collect stays user-owned ([`11_SUGGESTED_REGIONS.md`](11_SUGGESTED_REGIONS.md)).
- Never invent regions on failure; never feed suggestions into specimen marks.
- Prefer Worker analysis with honest empty/error states; no cloud inference.

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
- ~~MP3 encoder library~~ → `wasm-media-encoders` ([ADR 0002](../docs/decisions/0002-mp3-encoder.md))
- IndexedDB wrapper → Dexie (landed)
- Default recording constraints
- ~~16-bit vs 24-bit WAV default~~ → 16-bit default, 24-bit optional (landed)
- Mono-by-default policy
- Exact storage safety margin
- Whether source-format pass-through belongs in MVP
- Whether app installation is promoted before Safari validation

## 6. Current implementation focus

Phases 1–7 are implemented (capture through Audiotool upload queue); see `docs/STATUS.md`. Next is Phase 8 responsive / accessibility polish. Audiotool scopes/upload formats and Safari behavior remain validation risks.

**Suggested Regions** (`11_SUGGESTED_REGIONS.md`) — product decisions locked 2026-07-27; implement S1→S3 next (priority ahead of Phase 8 polish).
