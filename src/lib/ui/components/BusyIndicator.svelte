<script lang="ts">
	let { label = 'Loading' }: { label?: string } = $props();
</script>

<span class="busy" role="status" aria-label={label}>
	<span class="dot" aria-hidden="true"></span>
	<span class="dot" aria-hidden="true"></span>
	<span class="dot" aria-hidden="true"></span>
</span>

<style>
	.busy {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: calc(var(--text-meta) * 1.4);
	}

	.dot {
		width: var(--space-1);
		height: var(--space-1);
		border-radius: var(--radius-round);
		background: var(--ink-muted);
	}

	@media (prefers-reduced-motion: no-preference) {
		.dot {
			animation: pulse 900ms ease-in-out infinite;
		}

		.dot:nth-child(2) {
			animation-delay: 150ms;
		}

		.dot:nth-child(3) {
			animation-delay: 300ms;
		}
	}

	@keyframes pulse {
		0%,
		80%,
		100% {
			opacity: 0.28;
			transform: scale(0.85);
		}

		40% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
