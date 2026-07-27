<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { fade, fly } from 'svelte/transition';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import { Icon } from '$lib/ui/icons';

	let {
		title,
		onclose,
		children,
		dismissible = true,
		elevated = false
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
		/** When false, Escape / backdrop / close cannot dismiss (e.g. active upload). */
		dismissible?: boolean;
		/** Stack above another SheetOverlay (e.g. install guide over Account). */
		elevated?: boolean;
	} = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const desktop = new MediaQuery('min-width: 900px');

	const duration = $derived(reduceMotion.current ? 0 : 180);
	const panelFly = $derived(desktop.current ? { y: 12, duration } : { y: 48, duration });

	function autofocus(node: HTMLElement) {
		node.focus();
	}

	function noopAttach(node: HTMLElement) {
		void node;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && dismissible) {
			event.preventDefault();
			onclose();
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (dismissible && event.target === event.currentTarget) {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class={['backdrop', elevated && 'elevated']}
	role="presentation"
	transition:fade={{ duration }}
	onclick={onBackdropClick}
>
	<div
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		tabindex="-1"
		{@attach dismissible ? noopAttach : autofocus}
		transition:fly={panelFly}
	>
		<header class="header">
			<h2 id={titleId} class="title">{title}</h2>
			{#if dismissible}
				<GhostButton icon focusOnMount onclick={onclose} aria-label="Close">
					<Icon name="close" />
				</GhostButton>
			{/if}
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

	.backdrop.elevated {
		/* Above default sheets (50); below ConfirmDialog (60) and toast-host (70). */
		z-index: 55;
	}

	.panel {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: 85dvh;
		overflow: hidden;
		border-radius: var(--space-3) var(--space-3) 0 0;
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
		padding: var(--space-1) var(--space-2);
		/* Slightly darker than body paper; still Ghost-friendly for --surface hover/press. */
		background: color-mix(in srgb, var(--ink) 10%, var(--paper));
	}

	.title {
		margin: 0;
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
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
			border-radius: var(--space-3);
		}

		.body {
			padding-bottom: var(--space-4);
		}
	}
</style>
