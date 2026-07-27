# Contributing

## Setup

```sh
npm install
cp .env.example .env
npm run dev
```

Open **`http://127.0.0.1:5173`** (not `localhost`) so Audiotool OAuth redirects can match the developer dashboard.

## Quality gates

| Command            | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run check`    | `svelte-check` + sync                                                   |
| `npm run lint`     | Prettier + ESLint                                                       |
| `npm run format`   | Write Prettier                                                          |
| `npm run test:ci`  | Vitest unit once                                                        |
| `npm run test:e2e` | Playwright smoke (CI installs Chromium; local macOS uses system Chrome) |

CI runs lint, check, unit, and e2e smoke on pull requests. Deploy workflow on `main` also builds and publishes GitHub Pages (enable **Settings → Pages → Source: GitHub Actions** once). Set `PUBLIC_AUDIOTOOL_*` as repository **Actions variables** for production OAuth — see [README](README.md#publish-on-github-pages).

## Conventions

- **npm** only (`package-lock.json`, `engine-strict`).
- Prettier: **tabs**, single quotes, no trailing commas, print width 100.
- TypeScript strict; Svelte 5 **runes** (forced in Vite for project files).
- Imports via `$lib/...`. Keep MediaRecorder / OPFS / Dexie / Audiotool logic in modules under `src/lib`, not large route components.

## Environment

Public vars only (see `.env.example`):

- `BASE_PATH` — empty locally; `/<repo>` for project Pages sites
- `PUBLIC_AUDIOTOOL_CLIENT_ID`
- `PUBLIC_AUDIOTOOL_REDIRECT_URL` — exact match to Audiotool dashboard (use `127.0.0.1` for local)
- `PUBLIC_AUDIOTOOL_SCOPES`

Never commit `.env` or personal access tokens.

## Dependencies

Explain why a new dependency is needed before adding it. Prefer browser APIs and small libraries. Out of scope: custom backends, heavy DAW frameworks, dark-first redesigns.

## Docs and decisions

- Agents and humans: start with [`AGENTS.md`](AGENTS.md) and [`docs/STATUS.md`](docs/STATUS.md).
- UI work: [`DESIGN.md`](DESIGN.md) + [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css).
- Product intent lives in [`briefing/`](briefing/); engineering truth in [`docs/`](docs/).
- New architectural choices: copy [`docs/decisions/TEMPLATE.md`](docs/decisions/TEMPLATE.md) to `000N-short-title.md`.

## Agent tooling

- [`AGENTS.md`](AGENTS.md) — always-on agent entry
- [`DESIGN.md`](DESIGN.md) — visual contract for UI
- [`.cursor/rules/`](.cursor/rules/) — scoped coding rules (incl. design + waveform)
- [`src/lib/ui/AGENTS.md`](src/lib/ui/AGENTS.md) — component reuse notes
- [`.cursor/hooks/`](.cursor/hooks/) — deny/ask on `+server.ts`, secrets, and `localhost` OAuth misuse
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Copilot mirror of hard constraints

## Scope boundaries

SampleScout is capture-first and local-first. Do not add cross-device sync, cloud backup of local files, or uploads that continue after the tab is closed without an explicit product + ADR change.
