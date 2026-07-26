import { describe, expect, it } from 'vitest';
import {
	MIN_VIEW_SPAN,
	clampView,
	fitSelectionWindow,
	panView,
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

describe('viewZoomLevel', () => {
	it('reports 1× for a full view', () => {
		expect(viewZoomLevel({ start: 0, end: 1 })).toBe(1);
	});

	it('reports 2× for a half view', () => {
		expect(viewZoomLevel({ start: 0.25, end: 0.75 })).toBeCloseTo(2, 8);
	});
});
