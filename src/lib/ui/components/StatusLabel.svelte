<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		tone = 'neutral',
		density = 'default'
	}: {
		children: Snippet;
		tone?: 'neutral' | 'ok' | 'brand' | 'signal' | 'muted';
		density?: 'default' | 'compact';
	} = $props();
</script>

<span class="status" data-tone={tone} data-density={density}>
	{@render children()}
</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 1.5rem;
		padding: 0 var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-round);
		background: var(--surface);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status[data-density='compact'] {
		min-height: 0;
		padding: 0 var(--space-2);
		font-size: var(--text-micro);
		line-height: 1.2;
		letter-spacing: 0.03em;
	}

	.status[data-tone='ok'] {
		border-color: var(--line-strong);
	}

	.status[data-tone='brand'] {
		border-color: var(--brand);
		color: var(--brand);
	}

	.status[data-tone='signal'] {
		border-color: var(--signal);
		color: var(--signal);
	}

	.status[data-tone='muted'] {
		color: var(--ink-muted);
	}
</style>
