import { describe, expect, it } from 'vitest';
import { planClassificationWindows } from './resample';

describe('planClassificationWindows', () => {
	it('returns a single window for short clips', () => {
		expect(planClassificationWindows(80, 100, 8)).toEqual([0]);
	});

	it('spaces windows across longer audio without exceeding max', () => {
		const starts = planClassificationWindows(10_000, 100, 4);
		expect(starts.length).toBeLessThanOrEqual(4);
		expect(starts[0]).toBe(0);
		expect(starts.at(-1)).toBe(9900);
	});
});
