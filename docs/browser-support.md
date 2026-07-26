# Browser support

SampleScout targets modern mobile and desktop browsers with:

- Secure context (HTTPS or `127.0.0.1`)
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`
- Web Audio API
- Origin Private File System (OPFS)
- IndexedDB
- Web Workers
- Canvas

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
