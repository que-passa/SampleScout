<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<dl class="static-facts">
	{@render children()}
</dl>

<style>
	.static-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-2) var(--space-3);
		margin: 0;
		padding: var(--space-2) 0 0;
		border-top: 1px solid var(--line);
	}

	@media (min-width: 480px) {
		.static-facts {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
