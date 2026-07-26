# ADR 0003 — Extract selection as Local Draft (shared source)

## Status

Accepted — 2026-07-26

## Context

The product brief originally centered on many short, independent takes. Field practice more often captures a longer recording that contains several useful samples (atmo, textures, hits in sequence). Trim/Cut only reshape **one** take’s recipe and still yield a single upload unit. Users need to carve multiple upload-ready Local Drafts from one parent without DAW-style multi-region export.

## Decision

- Add **Extract**: from a valid waveform selection, create a new `Take` in the same Field Session.
- Parent take recipe and timeline stay unchanged.
- Extracted take **shares** the parent OPFS `source.fileRef` and uses an edit recipe that retains only the selection.
- Persist optional `derivedFromTakeId` for honest lineage in Collection / Field Notes.
- OPFS cleanup is reference-counted: delete a shared binary only when no remaining take references that `fileRef`.
- Do not copy/split source audio into new OPFS files for MVP.
- Do not build a multi-region marker list or multi-upload-from-one-take job model for MVP; each extract is a normal take with normal upload.

## Consequences

- Domain/schema: optional `derivedFromTakeId`; cleanup must count shared `fileRef`s.
- Retake/discard of a parent must keep shared audio available for surviving extracts (or block with a clear explanation — prefer keep-source for MVP).
- Peaks may be shared or regenerated per take; rendered/encoded assets remain per take.
- Briefing pack updated (product concept, UX, editor, data model, acceptance, build brief) to treat multi-sample extract as a primary review path.
- Implementation landed 2026-07-26: `buildExtractTakeDraft` / `extractTakeFromSelection` / Edit → **Extract**, shared `fileRef`, `derivedFromTakeId`, refcounted cleanup in `filterUnheldFileRefs` / `processDueCleanups`.
