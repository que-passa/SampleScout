<script lang="ts">
	import { formatMetadataOriginPill, type MetadataOrigin } from '$lib/domain';

	let {
		origin,
		loading = false
	}: {
		origin?: MetadataOrigin;
		/** Tag generation in progress — shows a spinner inside the pill. */
		loading?: boolean;
	} = $props();

	const label = $derived(formatMetadataOriginPill(origin));
	const visible = $derived(Boolean(label) || loading);
</script>

{#if visible}
	<span class="pill" role="status" aria-live="polite" aria-busy={loading}>
		{#if loading}
			<span class="spinner" aria-hidden="true">
				<span class="spinner-ring"></span>
			</span>
		{/if}
		{#if label}
			<span class="label">{label}</span>
		{/if}
	</span>
{/if}

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 0;
		padding: 1px var(--space-2);
		border: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
		border-radius: var(--radius-round);
		background: color-mix(in srgb, var(--surface-subtle) 70%, transparent);
		color: var(--ink-muted);
		font-size: var(--text-micro);
		font-weight: 500;
		line-height: 1.25;
		letter-spacing: 0.01em;
		text-transform: lowercase;
		white-space: nowrap;
		vertical-align: baseline;
	}

	.label {
		display: inline-block;
	}

	.spinner {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: calc(var(--space-1) * 2.5);
		height: calc(var(--space-1) * 2.5);
		flex-shrink: 0;
	}

	.spinner-ring {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		border: 1px solid color-mix(in srgb, var(--ink-muted) 35%, transparent);
		border-top-color: var(--ink-muted);
		border-radius: var(--radius-round);
	}

	@media (prefers-reduced-motion: no-preference) {
		.spinner-ring {
			animation: spin 700ms linear infinite;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
