# SampleScout — Agent Guide

Browser-only, mobile-first PWA: record field audio (often longer multi-sound takes), keep local files (IndexedDB + OPFS), extract regions into separate Local Files, light non-destructive edits, upload to Audiotool. **No custom backend.**

Visible vocabulary: **Capture** action; **Collection** destination at `/collection`; **Field Session** grouping; **Field Notes** for existing take metadata/details; **Collect** for retained trim → new Local File; **Local File** for a take saved on this device after the OPFS + IDB gate. Upload ships from Collection (confirm sheet → progress), not the take editor. Keep internal `Session` / `Take` terms and do not add a notes field.

## Start here

1. Read [`docs/STATUS.md`](docs/STATUS.md) — what exists vs stubbed.
2. Product intent: [`briefing/00_README.md`](briefing/00_README.md) → build prompt [`briefing/08_CURSOR_BUILD_BRIEF.md`](briefing/08_CURSOR_BUILD_BRIEF.md).
3. Engineering truth: [`docs/architecture.md`](docs/architecture.md) and ADRs in [`docs/decisions/`](docs/decisions/).
4. UI work: [`DESIGN.md`](DESIGN.md) before editing components or styles (tokens: `src/lib/styles/tokens.css`).

### Doc precedence

| Kind                                                 | Source of truth                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product / UX / visual intent                         | `briefing/`                                                                                    |
| Agent visual contract (concrete UI rules)            | [`DESIGN.md`](DESIGN.md) + `src/lib/styles/tokens.css`                                         |
| Implemented architecture, schema, integration status | `docs/` + code                                                                                 |
| Conflict between brief and `docs/` / tokens          | Prefer `docs/` + code/tokens; update brief or ADR if product intent changed                    |
| Conflict between **chat brief** and `briefing/`      | Point out mismatch; ask if unsure; update `briefing/` (and docs/ADR as needed); then implement |

Hard constraints (no backend, no PAT, `127.0.0.1`, static SPA, honesty) are not overridden by a casual chat brief — require an explicit product decision + ADR.

## Hard constraints

- **No backend:** no SvelteKit `+server.ts`, no serverless, no secrets store, no custom API.
- **No Audiotool PAT:** public OAuth2 PKCE only (`PUBLIC_AUDIOTOOL_*`). Never invent private tokens.
- **Dev URL:** `http://127.0.0.1:5173` only — not `localhost` (OAuth redirect registration).
- **Static hosting:** `@sveltejs/adapter-static`, `fallback: '404.html'`, optional `BASE_PATH`.
- **Client-only:** `ssr = false`; capture/OPFS/MediaRecorder are browser APIs.
- **Svelte 5 runes** (forced in Vite). Prefer `$lib/audio`, `$lib/persistence`, `$lib/audiotool` over fat components.
- **Design:** follow [`DESIGN.md`](DESIGN.md). Bright monochrome, Geist Mono; red (`--signal`) for record / clip / destructive, idle trim boundary markers, and Local File status chips; fade grips/envelopes use `--ink` wedges (not signal); primary CTAs (`PrimaryButton`), active waveform selection, and active trim drag use `--brand` / `--brand-soft`. No dark-first UI, no decorative fake waveforms.
- **Persistence honesty:** a take is “Saved locally” only after OPFS binary write **and** IndexedDB metadata commit succeed.
- **Do not claim** post-tab-close uploads, cross-device sync, or cloud backup of files.
- **Collection identity:** specimen marks must be deterministic from persisted take/source facts, never waveforms, fingerprints, quality scores, rarity, or random decoration. Neon fills come from `--specimen-neon-0`…`--specimen-neon-20` via the same hash. No XP, streaks, collectible cards, celebratory motion, or cloud implications.

## Current phase

Capture foundations through Phase 7 upload queue and Phase 4b Collect are largely in place. **Next:** Collection upload confirm sheet + Collect UX hardening, Phase 8 responsive / accessibility polish, and harden upload / Collect on real devices / Audiotool scopes. See [`docs/STATUS.md`](docs/STATUS.md).

Do **not** re-scaffold modules that already exist.

## Commands

```sh
npm install
cp .env.example .env
npm run dev          # 127.0.0.1:5173
npm run check
npm run lint
npm run test:ci      # unit
npm run test:e2e     # Playwright smoke
```

Package manager: **npm** (lockfile + `engine-strict`). Prefer tabs / single quotes (Prettier).

## Dependencies

Explain before adding a dependency. Prefer browser APIs and small focused libraries. Large frameworks and DAW-like editors are out of scope.

## Safety hooks

Project hooks under `.cursor/hooks/` warn or block inventing server routes, committing secrets, and using `localhost` for OAuth-oriented commands.
