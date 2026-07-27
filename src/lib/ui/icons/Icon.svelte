<script lang="ts">
	import { ICON_MARKUP } from './markup';
	import type { IconName } from './types';

	let {
		name,
		size = 24,
		label
	}: {
		name: IconName;
		/** Rendered width/height in CSS pixels. */
		size?: number;
		/** Optional accessible name; omit for decorative icons. */
		label?: string;
	} = $props();

	const decorative = $derived(!label);
	const markup = $derived(ICON_MARKUP[name]);
</script>

<span
	class="icon"
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden={decorative ? 'true' : undefined}
	aria-label={label}
	role={decorative ? undefined : 'img'}
>
	<!-- Trusted static assets from $lib/assets/ui-icons -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html markup}
</span>

<style>
	.icon {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		line-height: 0;
		color: inherit;
	}

	.icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
