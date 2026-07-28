<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		title = label,
		span = 1,
		children
	}: {
		label: string;
		title?: string;
		/** Grid column span for wide values (e.g. status chip). */
		span?: 1 | 2;
		children: Snippet;
	} = $props();
</script>

<div class="static-fact" style:grid-column={span > 1 ? `span ${span}` : undefined}>
	<dt {title}>{label}</dt>
	<dd>{@render children()}</dd>
</div>

<style>
	.static-fact {
		display: grid;
		gap: 1px;
		min-width: 0;
		margin: 0;
	}

	dt {
		margin: 0;
		font-size: var(--text-micro);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
		line-height: 1.2;
	}

	dd {
		margin: 0;
		min-width: 0;
		font-size: var(--text-meta);
		font-weight: 500;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	dd :global(.status) {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
