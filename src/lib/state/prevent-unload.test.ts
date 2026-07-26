import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetPreventUnloadForTests, acquirePreventUnload } from './prevent-unload';

describe('acquirePreventUnload', () => {
	afterEach(() => {
		__resetPreventUnloadForTests();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('registers beforeunload once for nested holds and clears on last release', () => {
		const addEventListener = vi.fn();
		const removeEventListener = vi.fn();
		vi.stubGlobal('window', { addEventListener, removeEventListener });

		const releaseA = acquirePreventUnload();
		const releaseB = acquirePreventUnload();

		expect(addEventListener).toHaveBeenCalledTimes(1);
		expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

		releaseA();
		expect(removeEventListener).not.toHaveBeenCalled();

		releaseB();
		expect(removeEventListener).toHaveBeenCalledTimes(1);
		expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
	});

	it('is a no-op when window is unavailable', () => {
		vi.stubGlobal('window', undefined);
		const release = acquirePreventUnload();
		expect(() => release()).not.toThrow();
	});
});
