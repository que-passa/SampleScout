<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	void goto(resolve('/capture'), { replaceState: true });
</script>

<p class="redirect">Opening Capture…</p>

<style>
	.redirect {
		padding: var(--space-4);
		color: var(--ink-muted);
		font-family: var(--font-mono);
	}
</style>
