<script lang="ts">
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
				<button type="button" class="primary" onclick={onaction}>{actionLabel}</button>
			{/if}
			{#if secondaryActionLabel && onsecondaryaction}
				<button type="button" class="secondary" onclick={onsecondaryaction}
					>{secondaryActionLabel}</button
				>
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

	.primary,
	.secondary {
		justify-self: start;
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border-radius: var(--radius-control);
		font-size: var(--text-button);
		font-weight: 600;
	}

	.primary {
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.secondary {
		border: 1px solid var(--ink);
		background: var(--surface);
		color: var(--ink);
	}
</style>
