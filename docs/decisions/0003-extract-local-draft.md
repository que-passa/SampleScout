# ADR 0003 — Collect retained trim as Local Draft (shared source)

## Status

Accepted — 2026-07-26  
Amended — 2026-07-27 (UI vocabulary: **Collect**; upload from Collection only)  
Amended — 2026-07-27 (Collect commits retained **trim**, not temporary waveform selection)

## Context

The product brief originally centered on many short, independent takes. Field practice more often captures a longer recording that contains several useful samples (atmo, textures, hits in sequence). Trim/Cut only reshape **one** take’s recipe and still yield a single upload unit. Users need to carve multiple upload-ready Local Drafts from one parent without DAW-style multi-region export.

Waveform **selection** is temporary tooling (preview / feed Trim). The retained **trim** (edit recipe bounds) is the result state. Collect must commit that result, not the ephemeral selection.

## Decision

- Add **Collect** (formerly Extract in UI copy): from a usable retained trim (single segment narrower than the full source), create a new `Take` in the same Field Session.
- Selection alone does not enable Collect; Trim (or trim-grip edits) establishes the collectable result.
- Collected take **shares** the parent OPFS `source.fileRef` and uses an edit recipe that retains only the trim bounds.
- After Collect, parent **source** stays intact; parent **recipe** resets to full-source identity so the next region can be trimmed and collected.
- Persist optional `derivedFromTakeId` for honest lineage in Collection / Field Notes.
- OPFS cleanup is reference-counted: delete a shared binary only when no remaining take references that `fileRef`.
- Do not copy/split source audio into new OPFS files for MVP.
- Do not build a multi-region marker list or multi-upload-from-one-take job model for MVP; each collected draft is a normal take with normal upload.
- Take editor does **not** start upload; Collection owns confirm → progress upload.
- Default upload-pending set excludes takes that have collected children (`derivedFromTakeId` pointing at them). Lone takes without children remain pending.
- Generated display names use short stem + two-digit number; never em/en dashes.

## Consequences

- Domain/schema: optional `derivedFromTakeId`; cleanup must count shared `fileRef`s.
- Discard of a parent must keep shared audio available for surviving children (prefer keep-source for MVP).
- Peaks may be shared or regenerated per take; rendered/encoded assets remain per take.
- Briefing pack updated (product concept, UX, editor, data model, acceptance, build brief) for Collect as the primary review path.
- Implementation: `collectableRetainedBounds` / `buildExtractTakeDraft` / collect persistence helpers / take **Collect** primary gated on trim; shared `fileRef`, `derivedFromTakeId`, refcounted cleanup in `filterUnheldFileRefs` / `processDueCleanups`.
