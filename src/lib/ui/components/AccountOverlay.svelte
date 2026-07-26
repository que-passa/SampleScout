<script lang="ts">
	import type { Snippet } from 'svelte';
	import SheetOverlay from './SheetOverlay.svelte';

	let {
		onclose,
		children
	}: {
		onclose: () => void;
		children: Snippet;
	} = $props();
</script>

<SheetOverlay title="Account" {onclose}>
	{@render children()}
</SheetOverlay>
