<script lang="ts">
	import type { SpecimenMark } from '$lib/domain';

	interface Props {
		mark: SpecimenMark;
	}

	let { mark }: Props = $props();
</script>

<svg
	class="specimen-mark"
	viewBox="0 0 {mark.width} {mark.height}"
	aria-hidden="true"
	focusable="false"
	shape-rendering="crispEdges"
>
	{#each mark.cells as row, rowIndex (rowIndex)}
		{#each row as active, columnIndex (`${rowIndex}-${columnIndex}`)}
			<rect class:active x={columnIndex + 0.1} y={rowIndex + 0.1} width="0.8" height="0.8" />
		{/each}
	{/each}
</svg>

<style>
	.specimen-mark {
		display: block;
		width: calc(var(--space-6) + var(--space-2));
		height: calc(var(--space-6) + var(--space-2));
		flex: none;
		color: var(--ink);
	}

	rect {
		fill: transparent;
		stroke: var(--line);
		stroke-width: 0.1;
	}

	rect.active {
		fill: currentColor;
		stroke: currentColor;
	}
</style>
