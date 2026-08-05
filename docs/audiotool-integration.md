# Audiotool integration

## Status

`@audiotool/nexus` is installed. Browser OAuth PKCE is wired via `initAudiotoolClient()` / `connectAudiotool()` / `disconnectAudiotool()`. The redirect host is **`/capture`** (must match the Audiotool developer app). Account UI remains a sheet/modal; `/account` is still a deep-link host for the overlay.

Product upload queue (Phase 7): `enqueueTakeUpload` / `retryTakeUpload` in `$lib/state/upload-queue` persists jobs in Dexie `uploadJobs`, encodes when needed, then calls `uploadSample` (bytes → `uploaded` → `ready`). Take Upload sheet drives Upload / Retry / Cancel.

## Register a developer app (required before Connect works)

1. Open [developer.audiotool.com/applications](https://developer.audiotool.com/applications).
2. Create Application:
   - **Name:** SampleScout (or any label)
   - **Redirect URI:** `http://127.0.0.1:5173/capture` (exact match, including path; no `localhost`)
   - **Scopes:** select every sample-related scope offered in the dashboard. Docs commonly show `project:write` for project sync; sample upload may require additional scopes — confirm in the dashboard and record them here after the spike.
3. Copy the **Client ID** into `.env`:

```env
PUBLIC_AUDIOTOOL_CLIENT_ID=<your-client-id>
PUBLIC_AUDIOTOOL_REDIRECT_URL=http://127.0.0.1:5173/capture
PUBLIC_AUDIOTOOL_SCOPES=project:write
```

4. Restart `npm run dev` (binds to `127.0.0.1:5173`).
5. Open Account (shell top-bar avatar / sheet) or Auth splash → **Connect Audiotool** → allow → return to `/capture`.

For production GitHub Pages, add the full site URL (including `BASE_PATH` if any) as another redirect URI and set `PUBLIC_AUDIOTOOL_REDIRECT_URL` / the matching GitHub Actions **variable** to that exact value. Example project site:

```env
PUBLIC_AUDIOTOOL_REDIRECT_URL=https://que-passa.github.io/SampleScout/capture
```

Local and Pages redirect URIs can both be registered on the same Audiotool application. CI injects production vars at build time (see `.github/workflows/deploy-pages.yml`); do not commit `.env`.

## Rules

- Browser OAuth2 PKCE only (`audiotool()` from `@audiotool/nexus`)
- Client ID may be public
- Never embed a personal access token
- Redirect URL must match the Audiotool dashboard exactly (trailing slash matters)
- Development redirect host: `127.0.0.1` (not `localhost`)
- Do not log access or refresh tokens

## Upload spike (manual)

Once connected, `uploadSample({ file, metadata })` calls `client.samples.upload`, waits for `uploaded`, then `ready`.

Validate with:

1. WAV / one-shot / unlisted
2. MP3 / loop / BPM / public

Record actual API errors and any scope gaps in this doc.

## Upload lifecycle (product — Phase 7)

1. Validate Field Notes (display name; BPM if loop)
2. Render / encode locally when no fresh `renderedAsset`
3. Create sample upload with metadata (default visibility `unlisted`; always includes hidden `recording` and `sample-scout` tags on Audiotool, not shown in Field Notes UI)
4. Upload bytes (`preventTabClose: true` when supported)
5. Wait for `uploaded`
6. Wait for `ready` — only then mark take `uploaded`
7. Keep local audio until ready succeeds

In-flight jobs abandoned by a page close are marked failed on hydrate with Retry. Takes that still show an active upload phase while the latest job is missing or terminal are repaired the same way (so Collection Retry stays available). Queued (not started) jobs may resume in-session after reload. Retry starts at the earliest required step: re-encode only when no fresh `renderedAsset` exists; otherwise upload bytes / wait for `ready` again.

Do not claim uploads continue after the page is closed.

## Features unavailable without a backend

- Continuing abandoned uploads server-side
- Storing refresh secrets outside the browser SDK flow
- Proxying Audiotool APIs
- Server-side format conversion before upload
