# Suggested Regions (take review accelerator)

**Status:** Decisions locked — **S1+S2 implemented** (analyzer, IDB cache, take chrome). S3 device harden remaining.  
**Date:** 2026-07-27 (decisions locked same day; IDB cache confirmed)  
**Relates to:** Collect path (ADR 0003), take editor (`04`), Later item in `01_PRODUCT_CONCEPT.md`

## 1. Intent

Field takes are often **one longer recording with several useful sounds**. Today the user finds those by eye on the waveform, selects, Trims, and Collects. That path stays primary.

**Suggested Regions** accelerates the same path: after the take’s audio is available, SampleScout may propose a short list of **rough time ranges** the user can step through. Each suggestion sets a **waveform selection only**. The user still decides whether to refine, Trim, Collect, skip, or ignore — no dedicated “accept suggestion” workflow in v1.

This is **not**:

- Automatic sample extraction or batch Collect
- Auto-Trim / one-tap approve
- Quality ranking, rarity, “best take,” or fingerprint identity
- A second waveform, decorative overlay art, or cloud analysis
- A replacement for manual selection / trim grips

Honesty framing (agent / secondary copy only — primary chrome is icon + count):

> Suggested cuts from loudness gaps — not guaranteed samples. You still Trim and Collect.

Do not imply ML taste, Audiotool-side processing, or that suggestions are “correct.”

## 2. Vocabulary

| Term                   | Meaning                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| **Suggested region**   | A candidate `{ startSeconds, endSeconds }` in **source** time, derived from measured PCM / envelope |
| **Suggestion set**     | Ordered list for the open take + analysis status (ephemeral for this open)                          |
| **Current suggestion** | Index the navigator is focused on                                                                   |
| **Analyze**            | Build/replace the suggestion set (auto or manual fallback)                                          |

Visible chrome: **`collection` icon + count** (same glyph family as Capture → Collection shortcut), not the word “suggested.” Prev/next for navigation. `aria-label`s carry the full meaning (e.g. “3 suggested regions”, “Next suggested region”).

Collect, Trim, selection, Local File, Field Notes retain existing meanings (`00_README.md`, ADR 0003).

## 3. Locked decisions

| #   | Topic                    | Decision                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Detection                | **Adaptive energy islands** (silence/gap splits) with **cheap energy backtrack** on region starts — see §5. No user-facing mode switch. No spectral-flux / librosa-class onset stack in v1.                                                                                                                                                                                      |
| 2   | When to run              | **Auto on open** when eligible and the energy path stays within budget (expected). **Manual Analyze** control (same bottom-left chrome) if analysis is too heavy, fails, or user wants a retry after a soft failure. **Duration gate: source duration > 3 s** (below that the whole take is usually one gesture; 5 s is unnecessarily shy for two spaced hits).                  |
| 3   | Apply                    | **Selection only** + fit view. No Trim-to-suggestion / accept workflow in v1. Existing Trim / Collect / grips remain the control surface.                                                                                                                                                                                                                                        |
| 4   | After Collect            | **Keep** the suggestion set; user may go to **next** suggestion or edit manually. **Do not** re-analyze. Index may advance to next if current still selected, but do not remove or rewrite ranges.                                                                                                                                                                               |
| 5   | Recipe / timeline        | Always analyze the **entire source** take (full file), never the visible zoom window alone. Suggestions are **source-second** ranges (same coordinate system as selection). Non-identity recipes do **not** block analyze or browse; applying a suggestion still sets source selection. User refines with existing tools (including Reset). No edited-timeline remapping for v1. |
| 6   | Persistence              | **Cache in IndexedDB** per take (`suggestedRegions` table). Keyed by `takeId` with a **source fingerprint** (`fileRef` + byteLength + duration + algorithm version) so stale rows re-analyze. Manual Analyze forces recompute + overwrite. Drop row on take discard / wipe.                                                                                                      |
| 7   | Chrome labels            | Action-row **left**: `collection` icon + **`N scouted`** (singular `1 scouted`). After engage: zero-padded **`01/10`**. **Next** appears only after engage. No Previous. No active fill on the count control.                                                                                                                                                                    |
| 8   | Analysis scope / markers | Analyze **entire take**. While engaged (navigating), show **muted scouted bands/ticks** on main wave + navigator for all candidates; current item uses normal brand selection. Idle (pre-engage): no multi-marker overlay.                                                                                                                                                       |
| 9   | Zero / failure UI        | **Hide** suggestion chrome. No “None suggested” / “no findings” banner. Manual path unchanged. Soft failure: hide auto chrome; optional manual Analyze remains available when duration gate passes.                                                                                                                                                                              |
| 10  | Caps / params            | Engineer defaults in one config module; tune on real takes (§5.3).                                                                                                                                                                                                                                                                                                               |
| 11  | Priority                 | **Now** — ahead of Phase 8 polish unless blocked by a device bug.                                                                                                                                                                                                                                                                                                                |
| 12  | Imports                  | **Same** rules as capture-sourced takes.                                                                                                                                                                                                                                                                                                                                         |

## 4. Target user flow

1. User opens a take (`/take/[takeId]`).
2. Waveform / decode path proceeds as today (peaks ensure-on-open; no fake wave).
3. If `sourceDuration > 3s` and not upload-locked for mutation: start **async** energy analysis (Worker) once PCM (or a derived mono envelope) is ready — **do not** block peaks or first paint.
4. If analysis finishes with **N ≥ 1**: show action-row **left** chrome — `collection` icon + **`N scouted`**. **No Next yet. Do not** auto-select on load.
5. User taps the scouted control → select suggestion `0` (fit view), switch label to **`01/N`**, reveal **Next**, and show muted scouted markers on the wave + navigator. Further taps on the control re-focus the current index.
6. **Next** advances to the following suggestion (wraps; label updates e.g. `02/10`). No Previous control in v1.
7. User may refine grips, Trim, Collect, skip, or ignore.
8. After Collect: parent recipe → identity (existing); suggestion set **unchanged**; user may Next or work manually — **no** re-analyze.
9. If N = 0 or hard failure: **hide** suggestion UI.
10. If auto path skipped for cost/error: show manual **Analyze** (collection icon) in the same action-row left slot when duration gate passes.

Manual editing without suggestions remains fully supported.

## 5. Analysis approach

### 5.1 Research → choice for SampleScout

Industry practice for **slice / note segmentation** (aubio, librosa-style pipelines) often combines:

1. An **onset strength** peak (spectral flux / novelty), then
2. **Backtrack** to a preceding **energy minimum** so the cut sits before the attack, and/or
3. **Silence / energy gating** to find offsets and reject false onsets in quiet noise.

For SampleScout v1 constraints (browser-only, mobile, honesty, no heavy deps, share decode with the editor):

| Approach                                          | Fit                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Full spectral onset (STFT flux)                   | Best for dense music hits; heavier CPU/memory; more tuning; overkill for many field gaps     |
| Pure fixed-threshold silence                      | Simple; brittle on wind / room tone                                                          |
| **Adaptive RMS energy islands + start backtrack** | Matches spaced field hits and short phrases; single-pass cheap; explainable; Worker-friendly |

**v1 algorithm (locked):** adaptive **energy-island** segmentation on a mono downmix envelope, with **local-minimum backtrack** on each region start (same _idea_ as onset backtrack, without a spectral ODF).

Out of v1: cloud ML, large WASM MIR stacks, quality scores, feeding specimen marks.

### 5.2 Pipeline sketch

1. Obtain planar PCM for the open take (prefer shared take decode cache; avoid a second full retain).
2. Mono downmix for analysis only.
3. Frame RMS (≈ 10–20 ms hop).
4. Adaptive noise floor (e.g. low percentile of envelope) + margin → binary above/below.
5. Contiguous above-threshold runs → candidate regions.
6. Split / require **min silence gap** between islands; **merge** micro-gaps.
7. **Backtrack** each start to a nearby preceding envelope local minimum (bounded window).
8. Pad slightly (pre/post); enforce min/max duration; drop near-full-file regions; time-order; **cap count**.
9. Return source-second `{ start, end }[]`.

### 5.3 Default parameters (tune later)

Centralize in e.g. `src/lib/config/suggest-regions.ts` (name flexible):

| Param                 | Starting default                 | Notes                                                                           |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| Duration gate         | `> 3` s                          | Below: no auto, no Analyze chrome                                               |
| Hop                   | ~15 ms                           | Envelope resolution                                                             |
| Min region            | ~100 ms                          | Ignore clicks/noise blips                                                       |
| Max region            | ~20 s                            | Longer islands may still be useful textures; cap prevents absurd singles — tune |
| Min silence to split  | ~250 ms                          | Merge closer gaps                                                               |
| Pad pre / post        | ~40 ms / ~100 ms                 | Keep attacks; avoid haircuts                                                    |
| Backtrack window      | ~80–120 ms                       | Toward preceding local min                                                      |
| Max suggestions       | `24`                             | Hard cap; time order; drop overflow silently (no “capped” badge in v1)          |
| Near-full-file reject | region covers ≳ 90% of take      | Treat as empty → hide UI                                                        |
| Auto budget           | aim ≲ 300 ms Worker time typical | If exceeded often on devices, fall back to manual-only Analyze for that session |

No user-facing parameter panel in v1.

### 5.4 Failure and empty states

| Outcome        | UI                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Running (auto) | No blocking overlay; chrome hidden until ready (or tiny non-blocking busy in left slot if needed — prefer hide until ready) |
| N ≥ 1          | Icon + count + prev/next                                                                                                    |
| N = 0          | Hide suggestion chrome                                                                                                      |
| Failure        | Hide; offer manual Analyze if gate passes                                                                                   |
| Navigate away  | Cancel Worker; no toast spam                                                                                                |

Never invent placeholder regions.

## 6. UX specification

### 6.1 Placement

Take bottom bar:

1. Wave chrome (zoom + overview)
2. Transport — empty left · `PlaybackControl` center · Loop right
3. Actions — **Scouted control left** (when available) · **Field Notes** + **Collect** right (Field Notes immediately left of Collect)

When N ≥ 1 (not yet engaged):

- `collection` icon + **`N scouted`** only (no Next, no wave markers)

After user taps scouted:

- Label becomes **`01/10`** (zero-padded) + **Next**
- Wave + navigator show muted bands/ticks for all scouted ranges; current uses brand selection

When manual Analyze only:

- Single control: `collection` icon, `aria-label="Analyze scouted regions"`

When hidden (short take / empty / ineligible): action-row left empty.

### 6.2 Apply behavior

- Sets `selectionStart` / `selectionEnd` in **source** seconds.
- Triggers existing selection auto-fit.
- Does **not** Trim, Collect, or change recipe.
- Manual selection drag after apply: user owns the selection; suggestion index may remain as “last jumped” without re-writing on every drag.

### 6.3 Accessibility

- Real buttons; labels like “Previous suggested region”, “Next suggested region”, “3 suggested regions”.
- Count is text in the control, not color alone.
- Do not spam `aria-live` on every analysis frame; one polite update when N becomes available is enough (optional).

## 7. Implementation notes (current codebase)

| Area         | Location                                | Implication                                                                             |
| ------------ | --------------------------------------- | --------------------------------------------------------------------------------------- |
| Take route   | `src/routes/take/[takeId]/+page.svelte` | Suggestion state; transport left chrome; apply → selection                              |
| Selection    | `WaveformOverview.svelte` bindings      | Reuse brand selection + auto-fit                                                        |
| Collect      | ADR 0003 / `hasUsableTrim`              | Suggestions never enable Collect directly                                               |
| Peaks        | `$lib/audio/peaks`                      | Overview peaks are coarse; **not** sufficient alone for region ends — need PCM/envelope |
| Decode cache | take zoom PCM path                      | Share buffer with analyzer when possible                                                |
| Workers      | peaks / mp3 client pattern              | `suggest-regions` Worker + main-thread fallback, timeout, cancel                        |
| Icons        | `Icon name="collection"`                | Same asset as Collection shortcut                                                       |
| Design       | `DESIGN.md`                             | Brand selection; no signal-as-smart; no specimen neon on suggestions                    |
| Config       | new `suggest-regions` config            | Defaults §5.3                                                                           |

Module sketch:

```
src/lib/config/suggest-regions.ts
src/lib/audio/suggest/
  types.ts
  envelope.ts
  segment.ts
  index.ts
  worker-client.ts
src/lib/workers/suggest-regions.worker.ts
```

Ephemeral UI state on take page:

- `suggestionStatus: 'idle' | 'running' | 'ready' | 'empty' | 'error'`
- `suggestions: { startSeconds, endSeconds }[]`
- `suggestionIndex: number | null` // null until user engages nav

Dexie **v2**: `suggestedRegions` table (`takeId` PK). See `docs/persistence-schema.md`.

## 8. UX risks (with locked mitigations)

1. **Over-trust** — Selection-only; Trim/Collect unchanged; no accept CTA.
2. **Surprise selection on open** — Snippets chrome visible without selection; first tap engages (§4).
3. **Chrome clutter** — Action-row left only; Next hidden until engage; hide when N = 0.
4. **Atmospheres → 0 or giant region** — Near-full reject + hide empty.
5. **Dense micro-hits** — Merge + min duration + max 24.
6. **After Collect confusion** — Same list, no re-analyze; user Next manually.
7. **Imports / music** — Same caps; hide when useless; no special import mode.
8. **Field Notes vs scouted** — Field Notes sits with Collect on the right; scouted owns the left.

## 9. Technical risks (with locked mitigations)

1. **Memory** — Share decode; transfer/copy carefully into Worker; drop on close.
2. **Jank** — Async Worker; never block peaks paint.
3. **Source vs edited time** — Suggestions always source seconds; selection already source-based on take page.
4. **Param brittleness** — One config module; device tune in S3.
5. **Cancel on navigate** — Mandatory.
6. **No scope creep** — No batch Collect, no multi-region upload job (ADR 0003).

## 10. Phased plan

### S0 — Decisions + briefing lock ✅

This document; pack cross-links updated. Persistence: IndexedDB cache (product decision).

### S1 — Analyzer library ✅

- Envelope + segment + backtrack + worker client.
- Unit tests: silence–hit–silence, continuous noise, single long tone, near-full energy, two close hits (merge).

### S2 — Take UI ✅

- Auto-run with duration gate; manual Analyze fallback.
- Transport left: icon + count + prev/next; hide when empty.
- Apply → selection + fit; no auto-apply on load.
- Respect `editsLocked` (no Analyze mutation / apply while locked).
- Dexie v2 `suggestedRegions` cache.

### S3 — Device harden

- Field hits, wind, atmo, imports on mid Android + iPhone Safari.
- Timing vs 300 ms budget; switch default to manual-only if auto is routinely slow.
- A11y labels; honesty in any secondary copy.

### Out of first implementation

- Batch Collect all / accept-all
- Auto-Trim
- Spectral onset mode switcher
- Multi-marker overlays
- Zero-crossing snap (still Later in `01`)
- Parameter UI

## 11. Acceptance criteria

- Regions come from real PCM/envelope only; never random/fake.
- Auto-run only when `sourceDuration > 3s`; analysis does not block waveform/playback.
- User can ignore suggestions and Trim → Collect as today.
- Focusing a suggestion sets selection only; Collect still requires usable trim.
- Prev/Next cycles; icon + count reflect N; chrome hidden when N = 0 or ineligible.
- After Collect, list persists for the open session without re-analyze.
- Analyze always covers the full source take.
- Imports behave like captures.
- No backend; no PAT; no post-close jobs.
- Primary chrome does not claim AI / cloud / quality ranking.

## 12. Briefing pack touchpoints

Update with this lock (same change set):

- `01_PRODUCT_CONCEPT.md` — Suggested Regions Later item (already pointed here)
- `02_UX_INFORMATION_ARCHITECTURE.md` — transport left suggestion chrome + Collect flow note
- `04_WAVEFORM_AND_AUDIO_EDITOR.md` — suggestion → selection
- `08_CURSOR_BUILD_BRIEF.md` — transport left + build pointer
- `10_RESEARCH_AND_OPEN_RISKS.md` — decisions resolved pointer
- `docs/STATUS.md` — S0 locked / S1 next

ADR: not required for Collect semantics. Schema bump documented in `docs/persistence-schema.md` (Dexie v2 `suggestedRegions`).

## 13. Summary

Suggested Regions is an **on-device adaptive energy-island navigator** (with cheap start backtrack) that feeds the existing selection → Trim → Collect loop. Auto-on-open when the take is longer than 3 s and the cheap path stays in budget; otherwise the same bottom-left `collection` icon becomes manual Analyze. Chrome is icon + count; empty means hidden; user keeps full control. Results are **cached in IndexedDB** per take (fingerprint-invalidated).
