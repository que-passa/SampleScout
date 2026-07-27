/** Visible waveform window as fractions of total duration [0, 1]. */
export type ViewWindow = { start: number; end: number };

/** Minimum span ≈ 256× zoom (detail PCM fills in past overview density). */
export const MIN_VIEW_SPAN = 1 / 256;

export const ZOOM_STEP_IN = 0.5;
export const ZOOM_STEP_OUT = 2;

export function clampView(start: number, end: number): ViewWindow {
	let nextStart = Number.isFinite(start) ? start : 0;
	let nextEnd = Number.isFinite(end) ? end : 1;
	if (nextEnd < nextStart) {
		const swap = nextStart;
		nextStart = nextEnd;
		nextEnd = swap;
	}
	let span = nextEnd - nextStart;
	if (span < MIN_VIEW_SPAN) {
		const mid = (nextStart + nextEnd) / 2;
		nextStart = mid - MIN_VIEW_SPAN / 2;
		nextEnd = mid + MIN_VIEW_SPAN / 2;
		span = MIN_VIEW_SPAN;
	}
	if (span > 1) {
		return { start: 0, end: 1 };
	}
	if (nextStart < 0) {
		nextEnd = Math.min(1, nextEnd - nextStart);
		nextStart = 0;
	}
	if (nextEnd > 1) {
		nextStart = Math.max(0, nextStart - (nextEnd - 1));
		nextEnd = 1;
	}
	return { start: nextStart, end: nextEnd };
}

/**
 * Zoom so `anchorAbs` (0–1 of total duration) stays fixed in the view.
 * `factor` < 1 zooms in; > 1 zooms out.
 */
export function zoomView(view: ViewWindow, factor: number, anchorAbs: number): ViewWindow {
	const span = Math.min(1, Math.max(MIN_VIEW_SPAN, (view.end - view.start) * factor));
	const safeSpan = Math.max(1e-9, view.end - view.start);
	const rel = Math.max(0, Math.min(1, (anchorAbs - view.start) / safeSpan));
	const nextStart = anchorAbs - rel * span;
	return clampView(nextStart, nextStart + span);
}

/** Shift the window by `deltaAbs` (fraction of total duration). Positive reveals later time. */
export function panView(view: ViewWindow, deltaAbs: number): ViewWindow {
	const span = view.end - view.start;
	return clampView(view.start + deltaAbs, view.start + deltaAbs + span);
}

export function fitFull(): ViewWindow {
	return { start: 0, end: 1 };
}

/** Fit a selection (seconds) with optional padding as a fraction of selection length. */
export function fitSelectionWindow(
	selectionStartSeconds: number,
	selectionEndSeconds: number,
	durationSeconds: number,
	paddingFraction = 0.12
): ViewWindow {
	if (!(durationSeconds > 0)) return fitFull();
	const lo = Math.min(selectionStartSeconds, selectionEndSeconds);
	const hi = Math.max(selectionStartSeconds, selectionEndSeconds);
	const pad = Math.max(0, (hi - lo) * paddingFraction);
	const start = (lo - pad) / durationSeconds;
	const end = (hi + pad) / durationSeconds;
	return clampView(start, end);
}

/**
 * Relative change vs the last auto-fitted selection below which post-gesture
 * auto-fit is skipped (micro edge / move nudges). Compared to prior span:
 * span delta or either-edge delta ≥ this fraction counts as significant.
 */
export const SELECTION_AUTOFIT_REL_THRESHOLD = 0.2;

export type SelectionBounds = { lo: number; hi: number };

/**
 * Whether a selection change is large enough to warrant auto-fitting the view.
 * Always true when there is no prior fitted selection. Micro-adjustments that
 * stay comfortably inside the current view return false.
 */
export function shouldAutoFitSelection(
	prev: SelectionBounds | null,
	nextLo: number,
	nextHi: number,
	view: ViewWindow,
	durationSeconds: number,
	relThreshold = SELECTION_AUTOFIT_REL_THRESHOLD
): boolean {
	const lo = Math.min(nextLo, nextHi);
	const hi = Math.max(nextLo, nextHi);
	if (!(hi > lo) || !(durationSeconds > 0)) return false;
	if (!prev || !(prev.hi > prev.lo)) return true;

	const prevSpan = prev.hi - prev.lo;
	const nextSpan = hi - lo;
	const spanDelta = Math.abs(nextSpan - prevSpan) / prevSpan;
	const startDelta = Math.abs(lo - prev.lo) / prevSpan;
	const endDelta = Math.abs(hi - prev.hi) / prevSpan;
	if (spanDelta >= relThreshold || startDelta >= relThreshold || endDelta >= relThreshold) {
		return true;
	}

	/* Selection left the comfortable frame — re-fit even for a smaller delta. */
	const v0 = view.start * durationSeconds;
	const v1 = view.end * durationSeconds;
	const viewSpan = Math.max(1e-9, v1 - v0);
	const margin = viewSpan * 0.05;
	if (lo < v0 + margin || hi > v1 - margin) return true;

	return false;
}

export function viewZoomLevel(view: ViewWindow): number {
	return Math.max(1, 1 / Math.max(1e-6, view.end - view.start));
}
