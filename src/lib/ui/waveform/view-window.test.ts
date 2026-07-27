import { describe, expect, it } from 'vitest';
import {
	MIN_VIEW_SPAN,
	SELECTION_AUTOFIT_REL_THRESHOLD,
	clampView,
	fitSelectionWindow,
	panView,
	shouldAutoFitSelection,
	viewZoomLevel,
	zoomView
} from './view-window';

describe('clampView', () => {
	it('keeps a valid window', () => {
		expect(clampView(0.2, 0.5)).toEqual({ start: 0.2, end: 0.5 });
	});

	it('clamps to [0, 1] and preserves span when possible', () => {
		const left = clampView(-0.1, 0.2);
		expect(left.start).toBeCloseTo(0, 10);
		expect(left.end).toBeCloseTo(0.3, 10);
		const right = clampView(0.9, 1.2);
		expect(right.start).toBeCloseTo(0.7, 10);
		expect(right.end).toBeCloseTo(1, 10);
	});

	it('enforces minimum span', () => {
		const view = clampView(0.5, 0.5);
		expect(view.end - view.start).toBeCloseTo(MIN_VIEW_SPAN, 8);
	});
});

describe('zoomView', () => {
	it('keeps the anchor under the same relative position', () => {
		const view = { start: 0, end: 1 };
		const anchor = 0.25;
		const next = zoomView(view, 0.5, anchor);
		expect(next.end - next.start).toBeCloseTo(0.5, 8);
		const relBefore = (anchor - view.start) / (view.end - view.start);
		const relAfter = (anchor - next.start) / (next.end - next.start);
		expect(relAfter).toBeCloseTo(relBefore, 8);
	});

	it('zooms out toward full take', () => {
		const next = zoomView({ start: 0.25, end: 0.75 }, 4, 0.5);
		expect(next).toEqual({ start: 0, end: 1 });
	});
});

describe('panView', () => {
	it('shifts without changing span', () => {
		const next = panView({ start: 0.2, end: 0.4 }, 0.1);
		expect(next.start).toBeCloseTo(0.3, 10);
		expect(next.end).toBeCloseTo(0.5, 10);
	});

	it('stops at edges', () => {
		expect(panView({ start: 0, end: 0.3 }, -0.5)).toEqual({ start: 0, end: 0.3 });
		expect(panView({ start: 0.7, end: 1 }, 0.5)).toEqual({ start: 0.7, end: 1 });
	});
});

describe('fitSelectionWindow', () => {
	it('pads and normalizes selection to the take', () => {
		const view = fitSelectionWindow(2, 4, 10, 0.25);
		expect(view.start).toBeCloseTo(0.15, 8);
		expect(view.end).toBeCloseTo(0.45, 8);
	});
});

describe('shouldAutoFitSelection', () => {
	const view = { start: 0.1, end: 0.5 };
	const duration = 10;

	it('fits when there is no prior selection', () => {
		expect(shouldAutoFitSelection(null, 2, 4, view, duration)).toBe(true);
	});

	it('skips micro edge nudges that stay framed', () => {
		const prev = { lo: 2, hi: 4 };
		/* 2s span → 5% nudge = 0.1s, below 20% threshold; still inside view [1,5]. */
		expect(shouldAutoFitSelection(prev, 2.05, 4, view, duration)).toBe(false);
		expect(SELECTION_AUTOFIT_REL_THRESHOLD).toBe(0.2);
	});

	it('fits when span changes enough', () => {
		const prev = { lo: 2, hi: 4 };
		expect(shouldAutoFitSelection(prev, 2, 4.5, view, duration)).toBe(true);
	});

	it('fits when the selection leaves the comfortable frame', () => {
		const prev = { lo: 2, hi: 4 };
		const tight = { start: 0.2, end: 0.4 }; /* view = 2–4s */
		expect(shouldAutoFitSelection(prev, 1.9, 4, tight, duration)).toBe(true);
	});
});

describe('viewZoomLevel', () => {
	it('reports 1× for a full view', () => {
		expect(viewZoomLevel({ start: 0, end: 1 })).toBe(1);
	});

	it('reports 2× for a half view', () => {
		expect(viewZoomLevel({ start: 0.25, end: 0.75 })).toBeCloseTo(2, 8);
	});
});
