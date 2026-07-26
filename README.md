# SampleScout

Browser-based, mobile-first PWA for capturing short audio takes, organizing device-local drafts in a Collection of Field Sessions, applying lightweight non-destructive edits, and uploading to Audiotool.

There is **no custom backend**. Drafts live in IndexedDB + OPFS on the device. Production hosting is [GitHub Pages](https://que-passa.github.io/SampleScout/) via `@sveltejs/adapter-static`.

Visible product vocabulary uses **Capture** for the action, **Collection** for the `/drafts` destination, **Field Session** for groups, **Field Notes** for existing take metadata/details, and **Local Draft** for a take safely saved on this device. Local Draft never means cloud backup or sync.

## Quick start

```sh
npm install
cp .env.example .env
npm run dev
```

Dev server binds to **`http://127.0.0.1:5173`** (required for Audiotool OAuth redirect registration — do not use `localhost`).

Requires **Node.js 22+** (`engine-strict`).

## Scripts

| Command             | Purpose                               |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Local development                     |
| `npm run build`     | Static production build               |
| `npm run preview`   | Preview the build on `127.0.0.1:4173` |
| `npm run check`     | `svelte-check` + sync                 |
| `npm run lint`      | Prettier + ESLint                     |
| `npm run test:unit` | Vitest unit tests                     |
| `npm run test:ci`   | Unit tests once (CI)                  |
| `npm run test:e2e`  | Playwright smoke                      |

## Publish on GitHub Pages

CI and deploy workflows live under [`.github/workflows/`](.github/workflows/). Pushes to `main` build a static site with `BASE_PATH=/<repo>` and publish via `actions/deploy-pages`.

### One-time repo setup

1. Push this repo to GitHub (e.g. [que-passa/SampleScout](https://github.com/que-passa/SampleScout)).
2. **Settings → Pages → Build and deployment → Source:** GitHub Actions.
3. **Settings → Secrets and variables → Actions → Variables** — add (public OAuth client values only):
   - `PUBLIC_AUDIOTOOL_CLIENT_ID`
   - `PUBLIC_AUDIOTOOL_REDIRECT_URL` = `https://que-passa.github.io/SampleScout/capture`
   - `PUBLIC_AUDIOTOOL_SCOPES` = `project:write,sample:write,sample:read` (confirm in the Audiotool dashboard)
4. In the [Audiotool developer dashboard](https://developer.audiotool.com/applications), register both redirect URIs:
   - Local: `http://127.0.0.1:5173/capture`
   - Pages: `https://que-passa.github.io/SampleScout/capture`
5. After the first green **Deploy to GitHub Pages** run, open `https://que-passa.github.io/SampleScout/`.

Manual production build (same as CI):

```sh
BASE_PATH=/SampleScout npm run build
```

Leave `BASE_PATH` empty for local development or a user/organization root site. The adapter emits `404.html` for client-side routes (e.g. `/take/[takeId]`); `static/.nojekyll` keeps Pages from running Jekyll.

## Audiotool configuration

Public env vars only (never a personal access token):

- `PUBLIC_AUDIOTOOL_CLIENT_ID`
- `PUBLIC_AUDIOTOOL_REDIRECT_URL` (exact match to the Audiotool developer dashboard)
- `PUBLIC_AUDIOTOOL_SCOPES`

OAuth PKCE is wired via `@audiotool/nexus`. Account opens as a sheet/modal; OAuth redirect host is **`/capture`** (must match the Audiotool app). Register a developer app and set env vars — see [Audiotool integration](docs/audiotool-integration.md).

## Documentation

- **Agents:** start with [`AGENTS.md`](AGENTS.md) and [`docs/STATUS.md`](docs/STATUS.md)
- [Design contract](DESIGN.md) — UI tokens and anti-patterns for agents
- [Contributing](CONTRIBUTING.md)
- [Architecture](docs/architecture.md)
- [Browser support](docs/browser-support.md)
- [Audiotool integration](docs/audiotool-integration.md)
- [Persistence schema](docs/persistence-schema.md)
- [Decisions](docs/decisions/)
- Product briefs in [`briefing/`](briefing/)

## License

[MIT](LICENSE)

## Current status

See [`docs/STATUS.md`](docs/STATUS.md) for the implemented-vs-stub map.

Capture through Phase 7 upload and Phase 4b Extract are largely landed. Audiotool OAuth needs a registered developer app plus env / GitHub Actions variables.

Next: Phase 8 responsive / a11y polish; harden upload and Extract on devices.
