<script lang="ts">
	/** Callers must pass a base-aware href from `resolve(...)`. */
	import GhostButton from './GhostButton.svelte';
	import { Icon } from '$lib/ui/icons';

	let { href, label }: { href: string; label: string } = $props();
</script>

<GhostButton class="ss-back-button" icon {href} aria-label={`Back to ${label}`} title={label}>
	<Icon name="back" />
</GhostButton>

<style>
	:global(.ss-ghost-button.ss-back-button) {
		justify-self: start;
	}
</style>
