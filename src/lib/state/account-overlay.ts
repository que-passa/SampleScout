import { goto, pushState } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

/** True when Account sheet/modal should be visible. */
export function isAccountOverlayOpen(): boolean {
	return Boolean(page.state.accountOpen) || page.route.id === '/account';
}

/** Open Account as sheet/modal via shallow history (keeps current page underneath). */
export function openAccountOverlay(): void {
	if (isAccountOverlayOpen()) return;
	pushState(resolve('/account'), { accountOpen: true });
}

/** Dismiss Account: history.back for shallow open, else return to Capture. */
export function closeAccountOverlay(): void {
	if (page.state.accountOpen) {
		history.back();
		return;
	}
	if (page.route.id === '/account') {
		void goto(resolve('/capture'), { replaceState: true });
	}
}
