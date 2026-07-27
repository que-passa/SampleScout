import { base } from '$app/paths';
import type { OnNavigate } from '@sveltejs/kit';

export type NavDirection = 'forward' | 'back' | 'fade';

export const PAGE_TRANSITION_MS = 280;

/** Stack depth for mobile push/pop chrome. Null = skip page transition (e.g. Account host). */
export function stackDepth(pathname: string): number | null {
	let path = pathname;
	if (base && path.startsWith(base)) {
		path = path.slice(base.length) || '/';
	}
	if (path.length > 1 && path.endsWith('/')) {
		path = path.slice(0, -1);
	}

	if (path === '/account') return null;
	if (path === '/' || path === '/capture') return 0;
	if (path === '/collection' || path === '/drafts' || path === '/debug') return 1;
	if (path.startsWith('/take/')) return 2;
	return 0;
}

export function navDirection(fromPath: string, toPath: string): NavDirection | null {
	const from = stackDepth(fromPath);
	const to = stackDepth(toPath);
	if (from === null || to === null) return null;
	if (to === from) return 'fade';
	return to > from ? 'forward' : 'back';
}

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * SvelteKit `onNavigate` handler: directional slide+fade via the View Transitions API.
 * No-ops when unsupported, reduced-motion, Account host, or missing from/to.
 */
export function handlePageTransition(navigation: OnNavigate): void | Promise<void> {
	if (!navigation.from || !navigation.to) return;
	if (!document.startViewTransition) return;
	if (prefersReducedMotion()) return;

	const direction = navDirection(navigation.from.url.pathname, navigation.to.url.pathname);
	if (!direction) return;

	document.documentElement.dataset.navDirection = direction;
	document.documentElement.style.setProperty('--page-transition-ms', `${PAGE_TRANSITION_MS}ms`);

	return new Promise((resolve) => {
		const transition = document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});

		void transition.finished.finally(() => {
			delete document.documentElement.dataset.navDirection;
		});
	});
}
