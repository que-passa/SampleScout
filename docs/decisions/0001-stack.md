# ADR 0001 — Static SvelteKit, no backend

## Status

Accepted — 2026-07-25

## Context

SampleScout must run as a phone-friendly capture tool hosted on GitHub Pages, authenticate directly with Audiotool, and keep files locally. Building a custom backend would add cost, secrets handling, and operational scope outside the product brief.

## Decision

- Use latest stable Svelte 5 + SvelteKit with TypeScript strict mode
- Deploy with `@sveltejs/adapter-static` and a `404.html` fallback
- Persist structured data in IndexedDB via Dexie
- Persist audio binaries in OPFS
- Keep Audiotool auth/upload in the browser behind a local adapter
- Prefer browser APIs and small focused libraries over large frameworks

## Consequences

- No cross-device file sync or cloud backup
- Uploads cannot reliably continue after the tab is closed
- MP3 encoding and rendering must happen on-device
- Capability gaps (especially Safari) must be surfaced honestly
- OAuth redirect URLs and `BASE_PATH` must be configured carefully for Pages
