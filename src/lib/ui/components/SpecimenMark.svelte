<script lang="ts">
	import type { SpecimenMark } from '$lib/domain';

	interface Props {
		mark: SpecimenMark;
		size?: 'default' | 'compact' | 'editor';
	}

	let { mark, size = 'default' }: Props = $props();

	const colorVar = $derived(`var(--specimen-neon-${mark.colorIndex})`);
</script>

<span
	class={[
		'specimen-mark-frame',
		size === 'compact' && 'specimen-mark-frame--compact',
		size === 'editor' && 'specimen-mark-frame--editor'
	]}
	style:color={colorVar}
>
	<svg
		class="specimen-mark"
		viewBox="0 0 {mark.width} {mark.height}"
		aria-hidden="true"
		focusable="false"
		shape-rendering="crispEdges"
	>
		{#each mark.cells as row, rowIndex (rowIndex)}
			{#each row as active, columnIndex (`${rowIndex}-${columnIndex}`)}
				{#if active}
					<rect x={columnIndex + 0.1} y={rowIndex + 0.1} width="0.8" height="0.8" />
				{/if}
			{/each}
		{/each}
	</svg>
</span>

<style>
	.specimen-mark-frame {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		padding: var(--space-2);
		background: var(--ink);
		border-radius: var(--radius-control);
		color: var(--ink);
		pointer-events: none;
	}

	.specimen-mark {
		display: block;
		width: calc(var(--space-6) + var(--space-2));
		height: calc(var(--space-6) + var(--space-2));
	}

	.specimen-mark-frame--compact {
		padding: var(--space-1);
	}

	.specimen-mark-frame--compact .specimen-mark {
		width: var(--space-5);
		height: var(--space-5);
	}

	.specimen-mark-frame--editor {
		padding: var(--space-1);
	}

	.specimen-mark-frame--editor .specimen-mark {
		width: calc(var(--space-5) - var(--space-1));
		height: calc(var(--space-5) - var(--space-1));
	}

	rect {
		fill: currentColor;
		stroke: none;
	}
</style>
