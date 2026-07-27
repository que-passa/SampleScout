<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	void goto(resolve('/collection'), { replaceState: true });
</script>

<p class="redirect">Opening Collection…</p>

<style>
	.redirect {
		padding: var(--space-4);
		color: var(--ink-muted);
		font-family: var(--font-mono);
	}
</style>
