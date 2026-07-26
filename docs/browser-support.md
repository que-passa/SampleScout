# Browser support

SampleScout targets modern mobile and desktop browsers with:

- Secure context (HTTPS or `127.0.0.1`)
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`
- Web Audio API
- Origin Private File System (OPFS) **with a working write path**
  - Prefer `FileSystemFileHandle.createWritable()` (Chrome / modern Edge)
  - Fall back to a dedicated worker + `createSyncAccessHandle()` (Safari / engines without async writers)
- IndexedDB
- Web Workers
- Canvas

Capability detection probes a real OPFS write (not only `getDirectory()`), so Capture can warn before recording when Local Drafts cannot be saved.

## Validation targets

| Browser         | Role                                     |
| --------------- | ---------------------------------------- |
| Android Chrome  | Primary mobile capture                   |
| Desktop Chrome  | Primary desktop review/upload            |
| Desktop Firefox | Secondary desktop                        |
| iPhone Safari   | Explicit risk gate (no backend fallback) |

Safari support is a release decision, not an assumption. Audiotool Nexus currently documents Chrome and Firefox among known platforms; Safari must be tested.

## Capability report

At startup / Account, `detectCapabilities()` probes the APIs above and surfaces:

- Whether recording is possible
- Whether drafts can be persisted
- Supported MediaRecorder MIME types
- Approximate storage quota remaining

The UI must explain missing capabilities instead of failing silently.
