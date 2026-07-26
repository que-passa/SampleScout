/**
 * Refcounted `beforeunload` guard for encode / upload work that must not
 * silently vanish when the tab closes.
 */
let holdCount = 0;

function onBeforeUnload(event: BeforeUnloadEvent): void {
	event.preventDefault();
	event.returnValue = '';
}

/** Hold the tab-close warning until the returned release function runs. */
export function acquirePreventUnload(): () => void {
	if (typeof window === 'undefined') return () => {};

	holdCount += 1;
	if (holdCount === 1) {
		window.addEventListener('beforeunload', onBeforeUnload);
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		holdCount = Math.max(0, holdCount - 1);
		if (holdCount === 0) {
			window.removeEventListener('beforeunload', onBeforeUnload);
		}
	};
}

/** Test helper — not for product code. */
export function __resetPreventUnloadForTests(): void {
	holdCount = 0;
	if (typeof window !== 'undefined') {
		window.removeEventListener('beforeunload', onBeforeUnload);
	}
}
