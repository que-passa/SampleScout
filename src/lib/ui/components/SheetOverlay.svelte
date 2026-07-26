<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { fade, fly } from 'svelte/transition';

	let {
		title,
		onclose,
		children
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
	} = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const desktop = new MediaQuery('min-width: 900px');

	const duration = $derived(reduceMotion.current ? 0 : 180);
	const panelFly = $derived(desktop.current ? { y: 12, duration } : { y: 48, duration });

	function autofocus(node: HTMLButtonElement) {
		node.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" transition:fade={{ duration }} onclick={onBackdropClick}>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		tabindex="-1"
		transition:fly={panelFly}
	>
		<header class="header">
			<h2 id={titleId} class="title">{title}</h2>
			<button type="button" class="close" {@attach autofocus} onclick={onclose} aria-label="Close">
				<span aria-hidden="true">×</span>
			</button>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0;
		background: color-mix(in srgb, var(--ink) 40%, transparent);
	}

	.panel {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: 85dvh;
		border: 1px solid var(--line-strong);
		border-bottom: none;
		border-radius: var(--radius-panel) var(--radius-panel) 0 0;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		outline: none;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-shrink: 0;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}

	.title {
		margin: 0;
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
		margin: calc(var(--space-2) * -1);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--ink);
		font-size: var(--text-title);
		line-height: 1;
		cursor: pointer;
	}

	.close:hover {
		background: var(--surface-subtle);
	}

	.close:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--space-4);
		padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
		background: var(--paper);
	}

	@media (min-width: 900px) {
		.backdrop {
			align-items: center;
			padding: var(--space-5);
		}

		.panel {
			width: min(28rem, 100%);
			max-height: min(85dvh, 40rem);
			border-bottom: 1px solid var(--line-strong);
			border-radius: var(--radius-panel);
		}

		.body {
			padding-bottom: var(--space-4);
		}
	}
</style>
