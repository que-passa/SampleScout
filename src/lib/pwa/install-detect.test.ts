import { describe, expect, it } from 'vitest';
import {
	INSTALL_DISMISSED_KEY,
	installGuideKind,
	isIosLike,
	isStandaloneDisplay,
	readLocalFlag,
	writeLocalFlag
} from './install-detect';

describe('isStandaloneDisplay', () => {
	it('matches display-mode standalone', () => {
		expect(
			isStandaloneDisplay({
				matchMedia: (q) => ({ matches: q.includes('standalone') }),
				navigatorStandalone: false
			})
		).toBe(true);
	});

	it('matches iOS navigator.standalone', () => {
		expect(
			isStandaloneDisplay({
				matchMedia: () => ({ matches: false }),
				navigatorStandalone: true
			})
		).toBe(true);
	});

	it('is false in a normal browser tab', () => {
		expect(
			isStandaloneDisplay({
				matchMedia: () => ({ matches: false }),
				navigatorStandalone: false
			})
		).toBe(false);
	});
});

describe('isIosLike', () => {
	it('detects iPhone UA', () => {
		expect(
			isIosLike({
				userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
				platform: 'iPhone',
				maxTouchPoints: 5
			})
		).toBe(true);
	});

	it('detects iPadOS desktop UA', () => {
		expect(
			isIosLike({
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
				platform: 'MacIntel',
				maxTouchPoints: 5
			})
		).toBe(true);
	});

	it('rejects desktop Mac without touch', () => {
		expect(
			isIosLike({
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
				platform: 'MacIntel',
				maxTouchPoints: 0
			})
		).toBe(false);
	});

	it('rejects Android Chrome', () => {
		expect(
			isIosLike({
				userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0',
				platform: 'Linux armv8l',
				maxTouchPoints: 5
			})
		).toBe(false);
	});
});

describe('installGuideKind', () => {
	it('hides when standalone or dismissed', () => {
		expect(
			installGuideKind({
				standalone: true,
				dismissed: false,
				ios: true,
				canNativePrompt: true
			})
		).toBe('none');
		expect(
			installGuideKind({
				standalone: false,
				dismissed: true,
				ios: true,
				canNativePrompt: true
			})
		).toBe('none');
	});

	it('prefers iOS guide over native on iOS', () => {
		expect(
			installGuideKind({
				standalone: false,
				dismissed: false,
				ios: true,
				canNativePrompt: false
			})
		).toBe('ios');
	});

	it('offers native when BIP is available', () => {
		expect(
			installGuideKind({
				standalone: false,
				dismissed: false,
				ios: false,
				canNativePrompt: true
			})
		).toBe('native');
	});

	it('offers none when Chromium has no deferred prompt yet', () => {
		expect(
			installGuideKind({
				standalone: false,
				dismissed: false,
				ios: false,
				canNativePrompt: false
			})
		).toBe('none');
	});
});

describe('local flags', () => {
	it('reads and writes dismissed flag', () => {
		const store = new Map<string, string>();
		const fake: Storage = {
			get length() {
				return store.size;
			},
			clear: () => store.clear(),
			getItem: (key) => store.get(key) ?? null,
			key: (i) => [...store.keys()][i] ?? null,
			removeItem: (key) => {
				store.delete(key);
			},
			setItem: (key, value) => {
				store.set(key, value);
			}
		};

		expect(readLocalFlag(fake, INSTALL_DISMISSED_KEY)).toBe(false);
		writeLocalFlag(fake, INSTALL_DISMISSED_KEY, true);
		expect(readLocalFlag(fake, INSTALL_DISMISSED_KEY)).toBe(true);
		writeLocalFlag(fake, INSTALL_DISMISSED_KEY, false);
		expect(readLocalFlag(fake, INSTALL_DISMISSED_KEY)).toBe(false);
	});
});
