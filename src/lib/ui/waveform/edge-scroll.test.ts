import { describe, expect, it } from 'vitest';
import {
	EDGE_SCROLL_ZONE_PX,
	edgeScrollCanPan,
	edgeScrollDeltaAbs,
	edgeScrollIntensity
} from './edge-scroll';

describe('edgeScrollIntensity', () => {
	it('is zero in the middle', () => {
		expect(edgeScrollIntensity(200, 400)).toBe(0);
	});

	it('ramps to -1 at the left edge', () => {
		expect(edgeScrollIntensity(EDGE_SCROLL_ZONE_PX, 400)).toBeCloseTo(0, 10);
		expect(edgeScrollIntensity(EDGE_SCROLL_ZONE_PX / 2, 400)).toBeCloseTo(-0.5, 10);
		expect(edgeScrollIntensity(0, 400)).toBeCloseTo(-1, 10);
		expect(edgeScrollIntensity(-10, 400)).toBeCloseTo(-1, 10);
	});

	it('ramps to +1 at the right edge', () => {
		expect(edgeScrollIntensity(400 - EDGE_SCROLL_ZONE_PX, 400)).toBeCloseTo(0, 10);
		expect(edgeScrollIntensity(400 - EDGE_SCROLL_ZONE_PX / 2, 400)).toBeCloseTo(0.5, 10);
		expect(edgeScrollIntensity(400, 400)).toBeCloseTo(1, 10);
		expect(edgeScrollIntensity(420, 400)).toBeCloseTo(1, 10);
	});

	it('returns 0 for invalid width', () => {
		expect(edgeScrollIntensity(0, 0)).toBe(0);
	});
});

describe('edgeScrollDeltaAbs', () => {
	it('scales with visible span (zoom)', () => {
		const dt = 1;
		const full = edgeScrollDeltaAbs({ start: 0, end: 1 }, 1, dt, 1);
		const half = edgeScrollDeltaAbs({ start: 0.25, end: 0.75 }, 1, dt, 1);
		expect(full).toBeCloseTo(1, 10);
		expect(half).toBeCloseTo(0.5, 10);
	});

	it('scales with intensity and dt', () => {
		const view = { start: 0.2, end: 0.4 };
		expect(edgeScrollDeltaAbs(view, 0.5, 0.5, 1)).toBeCloseTo(0.05, 10);
		expect(edgeScrollDeltaAbs(view, -1, 1, 0.9)).toBeCloseTo(-0.18, 10);
	});

	it('returns 0 for zero intensity or dt', () => {
		expect(edgeScrollDeltaAbs({ start: 0, end: 0.5 }, 0, 1)).toBe(0);
		expect(edgeScrollDeltaAbs({ start: 0, end: 0.5 }, 1, 0)).toBe(0);
	});
});

describe('edgeScrollCanPan', () => {
	it('blocks left pan at the start', () => {
		expect(edgeScrollCanPan({ start: 0, end: 0.3 }, -1)).toBe(false);
		expect(edgeScrollCanPan({ start: 0.1, end: 0.4 }, -1)).toBe(true);
	});

	it('blocks right pan at the end', () => {
		expect(edgeScrollCanPan({ start: 0.7, end: 1 }, 1)).toBe(false);
		expect(edgeScrollCanPan({ start: 0.6, end: 0.9 }, 1)).toBe(true);
	});
});
