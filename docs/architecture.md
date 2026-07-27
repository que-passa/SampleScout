# Architecture

SampleScout is a static, browser-only SvelteKit application.

## Doc precedence

| Kind                                                 | Source of truth                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Product / UX / visual intent                         | `briefing/`                                                                     |
| Implemented architecture, schema, integration status | `docs/` + code                                                                  |
| Conflict                                             | Prefer `docs/` + code; update the brief or add an ADR if product intent changed |

Agents: see [`AGENTS.md`](../AGENTS.md) and [`STATUS.md`](STATUS.md).

## Layers

```text
UI (routes + components)
→ Application (capture / take / editor / upload commands)
→ Domain (Session, Take, EditRecipe, UploadJob)
→ Infrastructure (MediaRecorder, Web Audio, OPFS, IndexedDB, Audiotool SDK)
```

Audio logic must not live inside large Svelte components. Prefer typed modules under `src/lib/audio`, `src/lib/persistence`, and `src/lib/audiotool`.

## Product vocabulary mapping

Visible labels do not rename architecture:

- Collection → `/collection` route (legacy `/drafts` redirects)
- Field Session → `Session` / `CaptureSession`
- Field Notes → existing `TakeMetadata` and details UI; no new notes field
- Local File → an existing saved take after the OPFS + IndexedDB commit gate; device-local only

Collection specimen marks are deterministic UI projections of persisted take/source facts (grid pattern + neon fill index). They are not stored audio fingerprints, waveform assets, quality scores, or random decoration and do not change the PCM peak pipeline.

## Hosting constraints

- `@sveltejs/adapter-static` with `fallback: '404.html'` for GitHub Pages SPA routing
- Optional `BASE_PATH` for project sites
- No SvelteKit server routes, secrets, or serverless functions
- Client-only runtime (`ssr = false`) because capture, OPFS, and MediaRecorder are browser APIs

## Persistence

| Store             | Contents                                                            |
| ----------------- | ------------------------------------------------------------------- |
| IndexedDB (Dexie) | Sessions, takes, edit recipes, upload queue, settings, cleanup jobs |
| OPFS              | Source audio, peak binaries, rendered WAV/MP3, trash                |

A take may be presented as `Local File` (supporting copy: not uploaded, only on this device) only after the OPFS binary write and IndexedDB metadata commit succeed.

## Source map

```text
src/lib/
  audio/          capture, decode, peaks, render, encode, playback
  audiotool/      OAuth + upload adapter
  capabilities/   browser capability report
  config/         recording limits + public config
  domain/         typed models and pure helpers
  persistence/    Dexie + OPFS
  state/          capture session controller
  ui/             components, layouts, waveform
  workers/        peak generation + MP3 encode workers
```

## Unavailable without a backend

Documented for honesty in the product UI and docs:

- Cross-device file sync
- Cloud backup of local takes
- Background upload after the browser is closed
- Server-side transcoding
- Secret storage for credentials
