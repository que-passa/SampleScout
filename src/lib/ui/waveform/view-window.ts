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

export function viewZoomLevel(view: ViewWindow): number {
	return Math.max(1, 1 / Math.max(1e-6, view.end - view.start));
}
