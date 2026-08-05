import { SUGGEST_REGIONS_AUTO_BUDGET_MS } from '$lib/config/suggest-regions';

/**
 * Session-scoped Suggested Regions auto policy.
 * Resets on full page reload; not persisted.
 */

let autoDisabledForSession = false;

export function isSuggestAutoDisabledForSession(): boolean {
	return autoDisabledForSession;
}

/** Disable auto-run for the rest of this browser session (manual Analyze still allowed). */
export function disableSuggestAutoForSession(): void {
	autoDisabledForSession = true;
}

/**
 * Record analysis duration for an auto-run (not manual Analyze).
 * First exceed of the typical budget disables future auto for this session.
 */
export function noteSuggestAutoAnalysisDuration(elapsedMs: number): void {
	if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
	if (elapsedMs > SUGGEST_REGIONS_AUTO_BUDGET_MS) {
		autoDisabledForSession = true;
	}
}

/** Test helper — reset session flag between cases. */
export function resetSuggestAutoBudgetForTests(): void {
	autoDisabledForSession = false;
}
