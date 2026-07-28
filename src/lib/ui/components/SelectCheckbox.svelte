<script lang="ts">
	import { Icon } from '$lib/ui/icons';

	let {
		checked = $bindable(false),
		disabled = false
	}: {
		checked?: boolean;
		disabled?: boolean;
	} = $props();
</script>

<span class="select-checkbox">
	<input type="checkbox" class="select-input" bind:checked {disabled} />
	<span class="select-toggle" aria-hidden="true">
		<span class="select-mark" class:checked>
			{#if checked}
				<Icon name="check" size={12} />
			{/if}
		</span>
	</span>
</span>

<style>
	.select-checkbox {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		height: var(--touch-min);
		flex-shrink: 0;
	}

	.select-input {
		position: absolute;
		inset: 0;
		z-index: 1;
		margin: 0;
		opacity: 0;
		cursor: default;
	}

	.select-input:disabled {
		cursor: not-allowed;
	}

	.select-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		height: var(--touch-min);
		pointer-events: none;
		color: var(--ink);
	}

	.select-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: var(--space-4);
		height: var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--surface);
		line-height: 1;
	}

	.select-mark.checked {
		border-color: var(--ink);
		background: var(--ink);
	}

	.select-input:focus {
		outline: none;
	}

	.select-input:focus-visible + .select-toggle .select-mark {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.select-input:disabled + .select-toggle {
		color: var(--disabled);
	}

	.select-input:disabled + .select-toggle .select-mark {
		border-color: var(--line);
	}

	.select-input:disabled:checked + .select-toggle .select-mark {
		border-color: var(--disabled);
		background: var(--disabled);
	}
</style>
