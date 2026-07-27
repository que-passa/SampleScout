# SampleScout — Cursor Briefing Pack

**Status:** Product and design concept  
**Date:** 2026-07-26  
**Target:** Browser-based, mobile-first PWA hosted on GitHub Pages  
**Frontend:** Latest stable Svelte + SvelteKit at implementation time  
**Backend:** None

## Relationship to engineering docs

This pack is the **product / UX / visual** source of truth. Living engineering docs live in [`docs/`](../docs/) (architecture, schema, Audiotool status, ADRs). Implementation status is tracked in [`docs/STATUS.md`](../docs/STATUS.md).

When a brief and `docs/`/code disagree, prefer **`docs/` + code**, then update the brief or add an ADR if the product decision changed.

When a **chat instruction** conflicts with this pack, agents should call out the mismatch, ask for confirmation if unsure, update the relevant briefing docs, then implement. Hard engineering constraints still require an explicit decision + ADR (see [`AGENTS.md`](../AGENTS.md)).

Agents should start at [`AGENTS.md`](../AGENTS.md). UI implementation contract: [`DESIGN.md`](../DESIGN.md) (tokens in `src/lib/styles/tokens.css`). Visual product depth remains in `03_VISUAL_DESIGN_SYSTEM.md` and `04_WAVEFORM_AND_AUDIO_EDITOR.md`.

## Purpose

This package is the source-of-truth briefing for designing and building **SampleScout** in Cursor.

SampleScout is a focused browser application that lets an Audiotool user:

1. Record field audio on a phone — often a longer take that contains several useful sounds, or several independent takes in one Field Session.
2. Keep each completed take locally for later.
3. Immediately record another take without forcing review.
4. Review a recording and **Collect** multiple useful regions into separate Local Files (parent source stays intact).
5. Discard individual takes (or Capture a new one — no in-place Retake).
6. Perform lightweight, non-destructive editing (trim/cut/fade/normalize) per file.
7. Review mostly prefilled metadata (Field Notes).
8. Upload from **Collection** (confirm sheet → progress) to Audiotool in WAV, MP3, or another supported format.

It is not a mobile DAW and it is not a permanent cloud-storage service.

## Collection identity vocabulary

- **Capture** is the primary action.
- **Collection** is the visible destination for saved takes; its route is `/collection`.
- **Field Session** is the user-facing grouping label. Engineering keeps `Session` / `CaptureSession`.
- **Field Notes** labels the existing take metadata/details surface. It does not add a persisted notes field.
- **Local File** means saved on this device only, and only after the OPFS source write and IndexedDB metadata commit both succeed.
- **Collect** creates a new Local File from the current retained **trim** of an existing take. Selection is temporary tooling for Trim; it does not enable Collect. The parent recording stays available; each collected file is its own Collection item with its own Field Notes and upload state. Shipping (upload) happens from Collection, not the take editor.
- **Display names** use a short stem plus a two-digit number (`Rain 01`); never em/en dashes in generated names.
- Deterministic specimen marks may give catalog identity to records. They derive only from persisted take/source facts; they are not waveforms, audio fingerprints, quality scores, or random decoration. Active cells use a deterministic neon fill from the 21-swatch specimen palette.

Collection delight stays bounded to catalog rhythm, indexing, and those deterministic marks. Do not add rarity, XP, streaks, collectible cards, celebratory motion, or cloud/sync implications.

## Documents

| File                                | Purpose                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `01_PRODUCT_CONCEPT.md`             | Product definition, principles, scope, limitations                                                        |
| `02_UX_INFORMATION_ARCHITECTURE.md` | Navigation, flows, responsive behavior, screen requirements                                               |
| `03_VISUAL_DESIGN_SYSTEM.md`        | Bright monochrome technical style and component rules                                                     |
| `04_WAVEFORM_AND_AUDIO_EDITOR.md`   | Precise waveform rendering and editor interaction specification                                           |
| `05_TECHNICAL_ARCHITECTURE.md`      | Browser-only Svelte architecture, audio, storage, Audiotool integration                                   |
| `06_DATA_MODEL_AND_STATES.md`       | Suggested TypeScript domain model and state machines                                                      |
| `07_MVP_ACCEPTANCE_CRITERIA.md`     | MVP scope, acceptance criteria, validation gates                                                          |
| `08_CURSOR_BUILD_BRIEF.md`          | Copy-ready implementation instruction for Cursor                                                          |
| `09_GITHUB_PAGES_DEPLOYMENT.md`     | Static deployment, base paths, OAuth redirects, PWA constraints                                           |
| `10_RESEARCH_AND_OPEN_RISKS.md`     | Verified facts, unresolved API questions, backend-required features                                       |
| `11_SUGGESTED_REGIONS.md`           | Suggested Regions: energy-island suggestions → selection → Trim/Collect (decisions locked; not built yet) |

## Reading order for implementation

1. Read `01_PRODUCT_CONCEPT.md`.
2. Read `03_VISUAL_DESIGN_SYSTEM.md` and `04_WAVEFORM_AND_AUDIO_EDITOR.md`.
3. Read `05_TECHNICAL_ARCHITECTURE.md` and `06_DATA_MODEL_AND_STATES.md`.
4. Use `08_CURSOR_BUILD_BRIEF.md` as the active build prompt.
5. Validate the gates in `07_MVP_ACCEPTANCE_CRITERIA.md` before expanding scope.

## Non-negotiable decisions

- Bright background, not a dark-first interface.
- Predominantly black, white, and neutral gray.
- Monospaced typography is central to the identity.
- Technical and precise, but not visually dense for its own sake.
- Waveforms must be derived accurately from the audio data.
- Catalog specimen marks are distinct from waveforms and never substitute for measured audio.
- Private is the default visibility UI label (maps to Audiotool `unlisted`).
- One-shot is the default sample kind.
- Every stopped take is saved locally before the workflow continues.
- No custom backend will be built.
- GitHub Pages is the intended production host.
- Browser limitations must be exposed honestly instead of hidden.

## Working product statement

> SampleScout is a capture-first, local-first Audiotool sample companion for recording several sounds quickly, keeping them as local files, applying precise lightweight edits, accepting useful metadata defaults, and uploading directly to Audiotool.
