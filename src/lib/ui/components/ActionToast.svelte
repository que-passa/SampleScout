<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { TransitionConfig } from 'svelte/transition';
	import { actionToast, getActionToastSnapshot, type ActionToastEntry } from '$lib/state';

	let entry = $state<ActionToastEntry | null>(getActionToastSnapshot());
	let busy = $state(false);

	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');

	/** Stronger than default back easing (~1.7) for a clear rubber overshoot. */
	const OVERSHOOT = 2.4;

	function backOut(t: number, c = OVERSHOOT): number {
		return 1 + --t * t * ((c + 1) * t + c);
	}

	function backIn(t: number, c = OVERSHOOT): number {
		return t * t * ((c + 1) * t - c);
	}

	onMount(() =>
		actionToast.subscribe(() => {
			entry = getActionToastSnapshot();
		})
	);

	function toastMotion(
		_node: Element,
		{
			duration = 400,
			y = 28,
			start = 0.92,
			easing = backOut
		}: {
			duration?: number;
			y?: number;
			start?: number;
			easing?: (t: number) => number;
		} = {}
	): TransitionConfig {
		const ms = reduceMotion.current ? 0 : duration;
		return {
			duration: ms,
			easing,
			css: (t, u) => {
				const opacity = Math.min(1, Math.max(0, t));
				return `opacity:${opacity};transform:translate3d(0, ${u * y}px, 0) scale(${start + t * (1 - start)})`;
			}
		};
	}

	const toastIn = { duration: 480, y: 32, start: 0.9, easing: backOut };
	const toastOut = { duration: 400, y: 24, start: 0.94, easing: backIn };

	async function onAction() {
		if (busy || !entry?.onAction) return;
		busy = true;
		try {
			await actionToast.runAction();
		} finally {
			busy = false;
		}
	}
</script>

{#if entry}
	{#key entry.id}
		<div
			class="toast"
			role="status"
			aria-live="polite"
			in:toastMotion|global={toastIn}
			out:toastMotion|global={toastOut}
		>
			<span class="message">{entry.message}</span>
			{#if entry.actionLabel && entry.onAction}
				<button type="button" class="action" disabled={busy} onclick={() => void onAction()}>
					{entry.actionLabel}
				</button>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.toast {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
		width: max-content;
		max-width: min(22rem, 100%);
		min-height: 2rem;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--brand);
		border-radius: var(--radius-control);
		background: var(--brand-soft);
		box-shadow: none;
		overflow: hidden;
		transform-origin: 50% 50%;
	}

	.message {
		flex: 1;
		align-self: center;
		font-size: var(--text-annotation);
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.action {
		align-self: center;
		min-height: 1.75rem;
		padding: 0 var(--space-2);
		border: 1px solid var(--brand);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-size: var(--text-annotation);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.action:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.action:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
</style>
