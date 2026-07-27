<script lang="ts">
	/** Callers must pass a base-aware href from `resolve(...)`. */
	import { Icon } from '$lib/ui/icons';

	let { href, label }: { href: string; label: string } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is pre-resolved by callers -->
<a class="back-button" {href} aria-label={`Back to ${label}`} title={label}>
	<span class="well">
		<span class="face">
			<Icon name="back" />
		</span>
	</span>
</a>

<style>
	.back-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		justify-self: start;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
		padding: 0;
		border: none;
		border-radius: var(--radius-control);
		color: var(--ink);
		background: transparent;
		text-decoration: none;
		cursor: pointer;
	}

	.back-button:focus-visible {
		outline: none;
	}

	.back-button:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		display: grid;
		place-items: center;
		min-height: var(--space-6);
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: calc(var(--radius-panel) + var(--space-1));
		background: transparent;
	}

	.face {
		display: grid;
		place-items: center;
		width: calc(var(--touch-min) - var(--space-2));
		height: calc(var(--touch-min) - var(--space-2));
		padding: 0;
		box-sizing: border-box;
		overflow: hidden;
		border-radius: var(--radius-panel);
		background: transparent;
	}

	@media (prefers-reduced-motion: no-preference) {
		.back-button {
			transition: color 140ms ease;
		}

		.well,
		.face {
			transition: background-color 140ms ease;
		}
	}

	@media (hover: hover) {
		.back-button:hover .well {
			background: var(--surface-subtle);
		}

		.back-button:hover .face {
			background: var(--surface);
		}
	}

	.back-button:active {
		background: var(--surface);
	}

	.back-button:active .well {
		background: var(--surface);
	}

	.back-button:active .face {
		background: var(--surface);
	}
</style>
