import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTabTarget, pushEscapeHandler } from './focus';

function el(id: string): HTMLElement {
	return { id } as HTMLElement;
}

describe('nextTabTarget', () => {
	const a = el('a');
	const b = el('b');
	const c = el('c');
	const focusables = [a, b, c];
	const container = {
		id: 'container',
		contains(node: Node | null) {
			return node === container || focusables.includes(node as HTMLElement);
		}
	} as HTMLElement;

	it('wraps forward from last to first', () => {
		expect(nextTabTarget(focusables, c, container, false)).toBe(a);
	});

	it('wraps backward from first to last', () => {
		expect(nextTabTarget(focusables, a, container, true)).toBe(c);
	});

	it('leaves mid-list to the browser', () => {
		expect(nextTabTarget(focusables, b, container, false)).toBeNull();
		expect(nextTabTarget(focusables, b, container, true)).toBeNull();
	});

	it('from the shell panel jumps to first / last', () => {
		expect(nextTabTarget(focusables, container, container, false)).toBe(a);
		expect(nextTabTarget(focusables, container, container, true)).toBe(c);
	});

	it('with no focusables returns the container', () => {
		expect(nextTabTarget([], container, container, false)).toBe(container);
	});

	it('pulls escaped focus back into the trap', () => {
		const outside = el('outside');
		expect(nextTabTarget(focusables, outside, container, false)).toBe(a);
		expect(nextTabTarget(focusables, outside, container, true)).toBe(c);
	});
});

describe('pushEscapeHandler', () => {
	type Listener = (event: Event) => void;
	const listeners = new Map<string, Set<Listener>>();

	afterEach(() => {
		listeners.clear();
		vi.unstubAllGlobals();
	});

	it('invokes only the topmost handler', () => {
		vi.stubGlobal('document', {
			addEventListener(type: string, listener: Listener) {
				const set = listeners.get(type) ?? new Set();
				set.add(listener);
				listeners.set(type, set);
			},
			removeEventListener(type: string, listener: Listener) {
				listeners.get(type)?.delete(listener);
			}
		});

		const lower = vi.fn();
		const upper = vi.fn();
		const popLower = pushEscapeHandler(lower);
		const popUpper = pushEscapeHandler(upper);

		const keydown = listeners.get('keydown');
		expect(keydown?.size).toBe(1);

		const event = {
			key: 'Escape',
			defaultPrevented: false,
			preventDefault: vi.fn(),
			stopImmediatePropagation: vi.fn()
		} as unknown as KeyboardEvent;

		for (const listener of keydown ?? []) listener(event);
		expect(upper).toHaveBeenCalledOnce();
		expect(lower).not.toHaveBeenCalled();

		popUpper();
		for (const listener of keydown ?? []) listener(event);
		expect(lower).toHaveBeenCalledOnce();

		popLower();
		expect(listeners.get('keydown')?.size ?? 0).toBe(0);
	});
});
