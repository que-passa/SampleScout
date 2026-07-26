# Copilot instructions — SampleScout

Follow [`AGENTS.md`](../AGENTS.md) and [`docs/STATUS.md`](../STATUS.md).

- No custom backend, `+server.ts`, or secrets. Public `PUBLIC_AUDIOTOOL_*` OAuth PKCE only — never a PAT.
- Dev on `http://127.0.0.1:5173` (not `localhost`). Static GitHub Pages via adapter-static.
- Svelte 5 runes; put audio/persistence/Audiotool logic in `$lib/*`, not fat components.
- Bright monochrome UI; accurate waveforms only (no decorative fakes). Follow `DESIGN.md` and `src/lib/styles/tokens.css` for UI.
- Prefer extending existing modules; check STATUS before scaffolding.
- Product briefs: `briefing/`. Engineering truth: `docs/` + code (prefer docs/code on conflict).
