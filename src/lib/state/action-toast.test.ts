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
});
