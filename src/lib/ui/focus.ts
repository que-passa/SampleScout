/** Focusable controls inside a dialog (excludes tabindex="-1" shells). */
const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(', ');

const escapeStack: Array<() => void> = [];
let escapeListening = false;

function onDocumentEscape(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || event.defaultPrevented) return;
	const top = escapeStack.at(-1);
	if (!top) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	top();
}

function ensureEscapeListener(): void {
	if (escapeListening || typeof document === 'undefined') return;
	document.addEventListener('keydown', onDocumentEscape, true);
	escapeListening = true;
}

function releaseEscapeListener(): void {
	if (!escapeListening || escapeStack.length > 0) return;
	document.removeEventListener('keydown', onDocumentEscape, true);
	escapeListening = false;
}

/** Register Escape for the topmost dialog; returns unregister. */
export function pushEscapeHandler(handler: () => void): () => void {
	escapeStack.push(handler);
	ensureEscapeListener();
	return () => {
		const index = escapeStack.lastIndexOf(handler);
		if (index >= 0) escapeStack.splice(index, 1);
		releaseEscapeListener();
	};
}

export function listFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(el) => el.getAttribute('aria-hidden') !== 'true' && isFocusableVisible(el)
	);
}

function isFocusableVisible(el: HTMLElement): boolean {
	if (el.closest('[inert], [aria-hidden="true"]')) return false;
	return el.getClientRects().length > 0;
}

/**
 * Where Tab / Shift+Tab should land next inside a trap.
 * Returns null when the browser default should run (active is mid-list).
 */
export function nextTabTarget(
	focusables: HTMLElement[],
	active: Element | null,
	container: HTMLElement,
	shiftKey: boolean
): HTMLElement | null {
	if (focusables.length === 0) return container;

	const first = focusables[0];
	const last = focusables[focusables.length - 1];

	if (shiftKey) {
		if (active === first || active === container || !container.contains(active)) {
			return last;
		}
		return null;
	}

	if (active === last || active === container || !container.contains(active)) {
		return first;
	}
	return null;
}

/** Move focus into a dialog shell without a visible ring (mouse/touch open). */
export function focusDialogPanel(node: HTMLElement): void {
	node.focus({ focusVisible: false });
}

export type DialogFocusOptions = {
	/** Called for Escape on this dialog while it is the topmost handler. Return false to ignore. */
	onEscape?: () => void | false;
};

/**
 * Svelte `{@attach}` helper — focus dialog, trap Tab, restore opener, stack Escape.
 * Use `dialogFocus(() => …)` when Escape availability depends on props.
 */
export function attachDialogPanel(node: HTMLElement): () => void {
	return dialogFocus()(node);
}

/** Factory form for reactive Escape (e.g. dismissible / busy). */
export function dialogFocus(getOnEscape?: () => (() => void) | null | undefined | false) {
	return (node: HTMLElement): (() => void) => {
		const previous =
			document.activeElement instanceof HTMLElement &&
			document.activeElement !== document.body &&
			!node.contains(document.activeElement)
				? document.activeElement
				: null;

		focusDialogPanel(node);

		function onKeydown(event: KeyboardEvent) {
			if (event.key !== 'Tab') return;
			const target = nextTabTarget(
				listFocusable(node),
				document.activeElement,
				node,
				event.shiftKey
			);
			if (!target) return;
			event.preventDefault();
			if (target === node) {
				node.focus({ focusVisible: false });
				return;
			}
			target.focus();
		}

		const popEscape = pushEscapeHandler(() => {
			const handler = getOnEscape?.();
			if (!handler) return;
			handler();
		});

		node.addEventListener('keydown', onKeydown);

		return () => {
			node.removeEventListener('keydown', onKeydown);
			popEscape();
			if (previous && document.contains(previous)) {
				previous.focus({ focusVisible: false });
			}
		};
	};
}

/** After route change, land on main so the previous view's control doesn't stay highlighted. */
export function focusMainWithoutRing(): void {
	const main = document.querySelector('main');
	if (main instanceof HTMLElement) {
		main.focus({ focusVisible: false });
		return;
	}

	const active = document.activeElement;
	if (active instanceof HTMLElement && active !== document.body) {
		active.blur();
	}
}

/** Run after `navigation.complete` — see `+layout.svelte`. */
export function handleNavigationFocus(navigation: { complete: Promise<void> }): void {
	void navigation.complete.then(focusMainWithoutRing);
}
