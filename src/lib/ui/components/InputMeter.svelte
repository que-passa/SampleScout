<script lang="ts">
	let {
		level,
		clipping = false,
		active = true
	}: {
		level: number;
		clipping?: boolean;
		active?: boolean;
	} = $props();

	const levelPercent = $derived(Math.max(0, Math.min(100, level * 100)));
</script>

<div
	class="meter"
	class:clipping
	class:inactive={!active}
	role="meter"
	aria-valuemin="0"
	aria-valuemax="1"
	aria-valuenow={level}
	aria-label="Input level"
>
	<div class="track">
		<div class="fill" style:width="{levelPercent}%"></div>
	</div>
</div>

<style>
	.meter {
		width: 100%;
		max-width: 12rem;
	}

	.track {
		height: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--ink);
		transition: width 0.05s ease-out;
		border-radius: calc(var(--radius-control) - 1px);
	}

	.clipping .fill {
		background: var(--signal);
	}

	.inactive {
		opacity: 0.5;
	}

	.inactive .fill {
		background: var(--disabled);
	}
</style>
