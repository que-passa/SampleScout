# ADR 0002 — Client-side MP3 via wasm-media-encoders

## Status

Accepted — 2026-07-26

## Context

Phase 6 requires browser-only WAV and MP3 export. WAV is a small in-house PCM encoder. MP3 needs a third-party encoder that runs in a Worker, supports CBR presets (96 / 128 / 192 kbps), stereo, progress, and cancellation, without a custom backend.

Candidates considered:

| Option | Notes |
| ------ | ----- |
| `wasm-media-encoders` | Focused LAME WASM (~66 KiB gzipped MP3), MIT wrapper, CBR bitrates, encode/finalize API suitable for chunked Worker progress |
| `@mediabunny/mp3-encoder` | Strong WASM LAME build, but peer-depends on the larger Mediabunny muxing stack |
| Classic `lamejs` forks | Heavier JS, weaker Worker/WASM story |

## Decision

- Use **`wasm-media-encoders`** for MP3 only (`createMp3Encoder`).
- Run encoding in `src/lib/workers/mp3.worker.ts` with chunked progress + AbortSignal cancel; fall back to the main thread if Workers fail.
- Keep WAV as a first-party module under `src/lib/audio/encode/` (16-bit default, 24-bit optional).
- Do not pull Mediabunny solely for MP3.

## Consequences

- LAME’s LGPL terms apply to the WASM encoder binary; the JS package license is MIT.
- Encode cost stays on-device; long takes must not block UI (Worker + progress).
- Source-format pass-through remains outside encode (upload may send the original file).
- Revisit if the package goes unmaintained or mobile encode performance regresses.
