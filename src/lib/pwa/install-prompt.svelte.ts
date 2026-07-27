import { countCollectionFiles } from '$lib/persistence';
import {
	INSTALL_DISMISSED_KEY,
	INSTALL_SOFT_TIP_KEY,
	installGuideKind,
	isIosLike,
	isStandaloneDisplay,
	readLocalFlag,
	writeLocalFlag,
	type InstallGuideKind
} from '$lib/pwa/install-detect';
import { actionToast } from '$lib/state/action-toast';
import { captureController } from '$lib/state/capture';
import { onTakeInventoryChanged } from '$lib/state/take-actions';

/** Minimal typing for Chromium beforeinstallprompt (not in all TS libs). */
export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: ReadonlyArray<string>;
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	prompt(): Promise<void>;
}

const SOFT_TIP_DELAY_MS = 5500;
const SOFT_TIP_TOAST_MS = 8000;

/**
 * Guided install UX state. Mutate properties; do not reassign this export.
 */
export const installPrompt = $state({
	ready: false,
	standalone: false,
	ios: false,
	canNativePrompt: false,
	dismissed: false,
	sheetOpen: false
});

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let softTipTimer: ReturnType<typeof setTimeout> | undefined;
let hydrated = false;

function storage(): Storage | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage;
}

function refreshStandalone(): void {
	if (typeof window === 'undefined') return;
	const nav = navigator as Navigator & { standalone?: boolean };
	installPrompt.standalone = isStandaloneDisplay({
		matchMedia: (q) => window.matchMedia(q),
		navigatorStandalone: nav.standalone
	});
}

function refreshGuideFlags(): void {
	refreshStandalone();
	installPrompt.dismissed = readLocalFlag(storage(), INSTALL_DISMISSED_KEY);
	installPrompt.canNativePrompt = deferredPrompt !== null;
}

export function getInstallGuide(): InstallGuideKind {
	return installGuideKind({
		standalone: installPrompt.standalone,
		dismissed: installPrompt.dismissed,
		ios: installPrompt.ios,
		canNativePrompt: installPrompt.canNativePrompt
	});
}

function onBeforeInstallPrompt(event: Event): void {
	event.preventDefault();
	deferredPrompt = event as BeforeInstallPromptEvent;
	installPrompt.canNativePrompt = true;
	scheduleSoftTip();
}

function onAppInstalled(): void {
	deferredPrompt = null;
	installPrompt.canNativePrompt = false;
	installPrompt.sheetOpen = false;
	refreshStandalone();
	dismissInstallOffer();
}

function onDisplayModeChange(): void {
	refreshStandalone();
	if (installPrompt.standalone) {
		installPrompt.sheetOpen = false;
		deferredPrompt = null;
		installPrompt.canNativePrompt = false;
	}
}

export function dismissInstallOffer(): void {
	installPrompt.dismissed = true;
	writeLocalFlag(storage(), INSTALL_DISMISSED_KEY, true);
	installPrompt.sheetOpen = false;
}

export function closeInstallSheet(): void {
	installPrompt.sheetOpen = false;
}

export function openInstallSheet(): void {
	if (getInstallGuide() === 'none') return;
	installPrompt.sheetOpen = true;
}

/** Account / toast entry: native prompt on Chromium, iOS steps sheet otherwise. */
export async function openInstallFlow(): Promise<void> {
	const guide = getInstallGuide();
	if (guide === 'none') return;

	if (guide === 'native') {
		await promptNativeInstall();
		return;
	}

	installPrompt.sheetOpen = true;
}

export async function promptNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	const event = deferredPrompt;
	if (!event) return 'unavailable';

	deferredPrompt = null;
	installPrompt.canNativePrompt = false;

	try {
		await event.prompt();
		const { outcome } = await event.userChoice;
		if (outcome === 'accepted') {
			dismissInstallOffer();
		}
		return outcome;
	} catch {
		return 'unavailable';
	}
}

function markSoftTipShown(): void {
	writeLocalFlag(storage(), INSTALL_SOFT_TIP_KEY, true);
}

async function tryShowSoftTip(): Promise<void> {
	if (getInstallGuide() === 'none') return;
	if (readLocalFlag(storage(), INSTALL_SOFT_TIP_KEY)) return;

	const phase = captureController.phase;
	if (phase === 'recording' || phase === 'finalizing' || phase === 'requesting') {
		scheduleSoftTip();
		return;
	}

	let total = 0;
	try {
		({ total } = await countCollectionFiles());
	} catch {
		return;
	}
	if (total < 1) return;

	markSoftTipShown();
	const guide = getInstallGuide();
	actionToast.show('Add to Home Screen for quicker Capture', {
		durationMs: SOFT_TIP_TOAST_MS,
		actionLabel: guide === 'ios' ? 'How' : 'Install',
		onAction: () => void openInstallFlow()
	});
}

export function scheduleSoftTip(): void {
	if (readLocalFlag(storage(), INSTALL_SOFT_TIP_KEY)) return;
	if (getInstallGuide() === 'none') return;
	// Do not reset — inventory churn (upload jobs, renames) would forever defer the tip.
	if (softTipTimer !== undefined) return;
	softTipTimer = setTimeout(() => {
		softTipTimer = undefined;
		void tryShowSoftTip();
	}, SOFT_TIP_DELAY_MS);
}

/** Start BIP / display-mode listeners and soft-tip scheduling. Idempotent for SPA lifetime. */
export function hydrateInstallPrompt(): void {
	if (typeof window === 'undefined') return;

	if (hydrated) {
		refreshGuideFlags();
		return;
	}
	hydrated = true;

	installPrompt.ios = isIosLike({
		userAgent: navigator.userAgent,
		platform: navigator.platform,
		maxTouchPoints: navigator.maxTouchPoints
	});
	refreshGuideFlags();
	installPrompt.ready = true;

	window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
	window.addEventListener('appinstalled', onAppInstalled);

	const mediaQueries = [
		window.matchMedia('(display-mode: standalone)'),
		window.matchMedia('(display-mode: fullscreen)'),
		window.matchMedia('(display-mode: minimal-ui)')
	];
	for (const mq of mediaQueries) {
		mq.addEventListener('change', onDisplayModeChange);
	}

	onTakeInventoryChanged(() => {
		scheduleSoftTip();
	});

	// Returning users who already have Local Files.
	scheduleSoftTip();
}
