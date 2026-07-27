<script lang="ts">
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';

	let {
		title,
		body,
		actionLabel,
		onaction,
		secondaryActionLabel,
		onsecondaryaction
	}: {
		title: string;
		body: string;
		actionLabel?: string;
		onaction?: () => void;
		secondaryActionLabel?: string;
		onsecondaryaction?: () => void;
	} = $props();
</script>

<div class="empty">
	<p class="label">Empty</p>
	<h2>{title}</h2>
	<p class="body">{body}</p>
	{#if (actionLabel && onaction) || (secondaryActionLabel && onsecondaryaction)}
		<div class="actions">
			{#if actionLabel && onaction}
				<PrimaryButton onclick={onaction}>{actionLabel}</PrimaryButton>
			{/if}
			{#if secondaryActionLabel && onsecondaryaction}
				<GhostButton onclick={onsecondaryaction}>{secondaryActionLabel}</GhostButton>
			{/if}
		</div>
	{/if}
</div>

<style>
	.empty {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
		border: 1px dashed var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	h2 {
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
</style>
