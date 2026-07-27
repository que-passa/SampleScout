import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionToast, getActionToastSnapshot } from './action-toast';

describe('actionToast', () => {
	afterEach(() => {
		actionToast.clear();
		vi.useRealTimers();
	});

	it('shows a message and clears after the duration', () => {
		vi.useFakeTimers();
		actionToast.show('Trim applied', 1000);
		expect(getActionToastSnapshot()?.message).toBe('Trim applied');

		vi.advanceTimersByTime(999);
		expect(getActionToastSnapshot()?.message).toBe('Trim applied');

		vi.advanceTimersByTime(1);
		expect(getActionToastSnapshot()).toBeNull();
	});

	it('ignores blank messages', () => {
		actionToast.show('   ');
		expect(getActionToastSnapshot()).toBeNull();
	});

	it('replaces an active toast in place without a new id', () => {
		vi.useFakeTimers();
		actionToast.show('Discarding 6 Local Files…', 1000);
		const first = getActionToastSnapshot();
		expect(first?.message).toBe('Discarding 6 Local Files…');

		actionToast.show('6 Local Files discarded', 1000);
		const second = getActionToastSnapshot();
		expect(second?.message).toBe('6 Local Files discarded');
		expect(second?.id).toBe(first?.id);

		vi.advanceTimersByTime(1000);
		expect(getActionToastSnapshot()).toBeNull();
	});
});
