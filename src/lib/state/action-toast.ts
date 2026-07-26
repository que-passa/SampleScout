import { ACTION_TOAST_MS } from '$lib/config/recording';

export interface ActionToastEntry {
	id: string;
	message: string;
	expiresAt: number;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
}

export interface ActionToastShowOptions {
	durationMs?: number;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
}

type Listener = () => void;

class ActionToastController {
	#listeners = new Set<Listener>();
	#timer: ReturnType<typeof setTimeout> | undefined;
	current: ActionToastEntry | null = null;

	subscribe = (listener: Listener): (() => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	#notify() {
		for (const listener of this.#listeners) listener();
	}

	#clearTimer() {
		if (this.#timer !== undefined) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
	}

	show(message: string, options: number | ActionToastShowOptions = {}) {
		const trimmed = message.trim();
		if (!trimmed) return;

		const opts: ActionToastShowOptions =
			typeof options === 'number' ? { durationMs: options } : options;
		const durationMs = opts.durationMs ?? ACTION_TOAST_MS;

		this.#clearTimer();
		const expiresAt = Date.now() + Math.max(0, durationMs);
		const next: ActionToastEntry = {
			id: crypto.randomUUID(),
			message: trimmed,
			expiresAt,
			actionLabel: opts.actionLabel?.trim() || undefined,
			onAction: opts.onAction
		};
		this.current = next;
		this.#notify();

		this.#timer = setTimeout(
			() => {
				if (this.current?.id === next.id) {
					this.current = null;
					this.#notify();
				}
			},
			Math.max(0, expiresAt - Date.now())
		);
	}

	async runAction(): Promise<void> {
		const entry = this.current;
		if (!entry?.onAction) return;
		await entry.onAction();
		if (this.current?.id === entry.id) {
			this.clear();
		}
	}

	clear() {
		this.#clearTimer();
		this.current = null;
		this.#notify();
	}
}

export const actionToast = new ActionToastController();

export function getActionToastSnapshot(): ActionToastEntry | null {
	return actionToast.current;
}
