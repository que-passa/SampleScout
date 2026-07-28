# ADR 0003 — Collect working selection as Local File (shared source)

## Status

Accepted — 2026-07-26  
Amended — 2026-07-27 (UI vocabulary: **Collect**; upload from Collection only)  
Amended — 2026-07-27 (Collect commits retained **trim**, not temporary waveform selection)  
Amended — 2026-07-27 (Local Draft → Local File; Collection route `/collection`)  
Amended — 2026-07-28 (Collect clones full collectable recipe: fades, normalize, future ops — not bounds alone)  
Amended — 2026-07-28 (Collect from **working selection**; no Trim step; fades + auto peak-normalize on selection before Collect)  
Amended — 2026-07-28 (Collect inherits **all** active edits: gain + rumble/gate/limit; effects stay available while selecting)

## Context

The product brief originally centered on many short, independent takes. Field practice more often captures a longer recording that contains several useful samples (atmo, textures, hits in sequence). Users need to carve multiple upload-ready Local Files from one parent without DAW-style multi-region export.

The harvest loop is: Record → Scout (optional) → apply optional effects and fades → adjust selection → Collect. Effects are not locked while a selection is active. Selection is the working region; Collect commits that full shaped result.

## Decision

- **Collect** creates a new `Take` in the same Field Session from a usable **working selection** (single range narrower than the full source), including selection fades, auto peak-normalize, segment gain, and take-level processing (high-pass rumble, gate, soft limit).
- There is **no Trim button / Trim step** in the take UI. Domain retained-boundary helpers remain for editing non-identity child Local Files.
- Peak normalize is enabled as soon as a usable selection exists so waveform + playback preview match Collect.
- Gain / Rumble / Limit / Gate remain available while a selection is active; preview and Collect use the same shaped recipe.
- Collected take **shares** the parent OPFS `source.fileRef` and receives a **clone** of that full shaped edit recipe (bounds, fades, gain, normalize, processing via `cloneEditRecipe`). New segment ids; source binary unchanged.
- After Collect, parent **source** stays intact; parent **recipe** resets to full-source identity; selection and selection fades clear so the next region can be collected.
- Persist optional `derivedFromTakeId` for honest lineage in Collection / Field Notes.
- OPFS cleanup is reference-counted: delete a shared binary only when no remaining take references that `fileRef`.
- Do not copy/split source audio into new OPFS files for MVP.
- Take editor does **not** start upload; Collection owns confirm → progress upload.
- Default upload-pending set excludes takes that have collected children (`derivedFromTakeId` pointing at them). Lone takes without children remain pending.
- Generated display names use short stem + two-digit number; never em/en dashes.

## Consequences

- Domain/schema: optional `derivedFromTakeId`; cleanup must count shared `fileRef`s.
- Discard of a parent must keep shared audio available for surviving children (prefer keep-source for MVP).
- Peaks may be shared or regenerated per take; rendered/encoded assets remain per take.
- New edit-recipe fields must be added to `cloneEditRecipe` so Collect continues to transfer them.
- Implementation: `recipeFromWorkingRegion` / `cloneEditRecipeForCollect` / `buildExtractTake`; take **Collect** gated on usable selection; fade grips on selection while collecting; region grips on committed non-identity children.
