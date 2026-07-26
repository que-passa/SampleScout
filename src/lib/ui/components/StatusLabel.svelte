<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		tone = 'neutral'
	}: {
		children: Snippet;
		tone?: 'neutral' | 'ok' | 'signal' | 'muted';
	} = $props();
</script>

<span class="status" data-tone={tone}>
	{@render children()}
</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 1.5rem;
		padding: 0 var(--space-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-round);
		background: var(--surface);
		font-size: var(--text-annotation);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status[data-tone='ok'] {
		border-color: var(--line-strong);
	}

	.status[data-tone='signal'] {
		border-color: var(--signal);
		color: var(--signal);
	}

	.status[data-tone='muted'] {
		color: var(--ink-muted);
	}
</style>
