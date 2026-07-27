<script lang="ts">
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';

	let {
		title,
		body = '',
		actionLabel,
		onaction,
		secondaryActionLabel,
		onsecondaryaction,
		align = 'start',
		framed = true
	}: {
		title: string;
		body?: string;
		actionLabel?: string;
		onaction?: () => void;
		secondaryActionLabel?: string;
		onsecondaryaction?: () => void;
		align?: 'start' | 'center';
		framed?: boolean;
	} = $props();

	const showBody = $derived(body.trim().length > 0);
</script>

<div class="empty" class:framed class:align-center={align === 'center'}>
	<h2>{title}</h2>
	{#if showBody}
		<p class="body">{body}</p>
	{/if}
	{#if (actionLabel && onaction) || (secondaryActionLabel && onsecondaryaction)}
		<div class="actions">
			{#if secondaryActionLabel && onsecondaryaction}
				<GhostButton onclick={onsecondaryaction}>{secondaryActionLabel}</GhostButton>
			{/if}
			{#if actionLabel && onaction}
				<PrimaryButton onclick={onaction}>{actionLabel}</PrimaryButton>
			{/if}
		</div>
	{/if}
</div>

<style>
	.empty {
		display: grid;
		gap: var(--space-3);
	}

	.empty.framed {
		padding: var(--space-5);
		border: 1px dashed var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.empty.align-center {
		justify-items: center;
		text-align: center;
	}

	h2 {
		margin: 0;
		font-size: var(--text-screen);
		font-weight: 600;
	}

	.body {
		color: var(--ink-muted);
		max-width: 36rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.align-center .actions {
		justify-content: center;
	}
</style>
