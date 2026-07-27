<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { fade, fly } from 'svelte/transition';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		busy = false,
		oncancel,
		onconfirm
	}: {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		busy?: boolean;
		oncancel: () => void;
		onconfirm: () => void;
	} = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const messageId = `${uid}-message`;
	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const desktop = new MediaQuery('min-width: 900px');

	const duration = $derived(reduceMotion.current ? 0 : 180);
	const panelFly = $derived(desktop.current ? { y: 12, duration } : { y: 48, duration });

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			if (!busy) oncancel();
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (busy) return;
		if (event.target === event.currentTarget) {
			oncancel();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" transition:fade={{ duration }} onclick={onBackdropClick}>
	<div
		class="panel"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-describedby={messageId}
		tabindex="-1"
		transition:fly={panelFly}
	>
		<header class="header">
			<h2 id={titleId} class="title">{title}</h2>
		</header>
		<div class="body">
			<p id={messageId} class="message">{message}</p>
			<div class="actions">
				<GhostButton focusOnMount disabled={busy} onclick={oncancel}>
					{cancelLabel}
				</GhostButton>
				<GhostButton danger disabled={busy} onclick={onconfirm}>
					{busy ? 'Working…' : confirmLabel}
				</GhostButton>
			</div>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
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

	.body {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
		background: var(--paper);
	}

	.message {
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
		line-height: 1.4;
		color: var(--ink);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	@media (min-width: 900px) {
		.backdrop {
			align-items: center;
			padding: var(--space-5);
		}

		.panel {
			width: min(24rem, 100%);
			max-height: min(85dvh, 24rem);
			border-bottom: 1px solid var(--line-strong);
			border-radius: var(--radius-panel);
		}

		.body {
			padding-bottom: var(--space-4);
		}
	}
</style>
