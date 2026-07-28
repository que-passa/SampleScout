/** Move focus into a dialog shell without a visible ring (mouse/touch open). */
export function focusDialogPanel(node: HTMLElement): void {
	node.focus({ focusVisible: false });
}

/** Svelte `{@attach}` helper — focus dialog panel on mount. */
export function attachDialogPanel(node: HTMLElement): void {
	focusDialogPanel(node);
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
