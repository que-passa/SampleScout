/** localStorage: hide Account CTA + soft tip until cleared. */
export const INSTALL_DISMISSED_KEY = 'samplescout.install.dismissed';

/** localStorage: soft tip already shown once. */
export const INSTALL_SOFT_TIP_KEY = 'samplescout.install.softTipShown';

export type InstallGuideKind = 'native' | 'ios' | 'none';

export interface StandaloneProbe {
	matchMedia: (query: string) => { matches: boolean };
	navigatorStandalone?: boolean;
}

export interface PlatformProbe {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
}

/** True when running as an installed PWA (or iOS home-screen web app). */
export function isStandaloneDisplay(probe: StandaloneProbe): boolean {
	if (probe.matchMedia('(display-mode: standalone)').matches) return true;
	if (probe.matchMedia('(display-mode: fullscreen)').matches) return true;
	if (probe.matchMedia('(display-mode: minimal-ui)').matches) return true;
	return probe.navigatorStandalone === true;
}

/** iOS / iPadOS — no beforeinstallprompt; Share → Add to Home Screen only. */
export function isIosLike(probe: PlatformProbe): boolean {
	const ua = probe.userAgent;
	if (/iPad|iPhone|iPod/i.test(ua)) return true;
	// iPadOS 13+ may report as MacIntel with touch
	return probe.platform === 'MacIntel' && probe.maxTouchPoints > 1;
}

/**
 * Which guided-install UX to offer (caller still gates on standalone / dismissed / BIP).
 * - `ios` — illustrated Share steps
 * - `native` — Chromium-family when a deferred beforeinstallprompt is available
 * - `none` — no guided affordance
 */
export function installGuideKind(options: {
	standalone: boolean;
	dismissed: boolean;
	ios: boolean;
	canNativePrompt: boolean;
}): InstallGuideKind {
	if (options.standalone || options.dismissed) return 'none';
	if (options.ios) return 'ios';
	if (options.canNativePrompt) return 'native';
	return 'none';
}

export function readLocalFlag(storage: Pick<Storage, 'getItem'> | null, key: string): boolean {
	if (!storage) return false;
	try {
		return storage.getItem(key) === '1';
	} catch {
		return false;
	}
}

export function writeLocalFlag(
	storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
	key: string,
	value: boolean
): void {
	if (!storage) return;
	try {
		if (value) storage.setItem(key, '1');
		else storage.removeItem(key);
	} catch {
		/* private mode / quota — ignore */
	}
}
