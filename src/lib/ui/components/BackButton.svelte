<script lang="ts">
	let { href, label }: { href: string; label: string } = $props();
</script>

<a
	class="back-button"
	{href}
	aria-label={`Back to ${label}`}
	title={label}
>
	<svg
		class="back-icon"
		viewBox="0 0 24 24"
		width="20"
		height="20"
		aria-hidden="true"
		focusable="false"
		fill="currentColor"
	>
		<path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
	</svg>
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
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		color: var(--ink);
		background: var(--surface);
		text-decoration: none;
		cursor: pointer;
	}

	.back-button:hover {
		background: var(--surface-subtle);
	}

	.back-button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.back-icon {
		display: block;
	}
</style>
