<script lang="ts">
	let {
		elapsedSeconds,
		remainingSeconds,
		warning = 'none'
	}: {
		elapsedSeconds: number;
		remainingSeconds?: number;
		warning?: 'none' | 'passive' | 'remaining' | 'strong' | 'limit';
	} = $props();

	function formatTime(seconds: number): string {
		const clamped = Math.max(0, Math.floor(seconds));
		const mins = Math.floor(clamped / 60);
		const secs = clamped % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	const elapsed = $derived(formatTime(elapsedSeconds));
	const remaining = $derived(remainingSeconds ? formatTime(remainingSeconds) : null);
	const showRemaining = $derived(
		warning === 'remaining' || warning === 'strong' || warning === 'limit'
	);
	const isSignalColor = $derived(warning === 'strong' || warning === 'limit');
</script>

<div class="timer" class:signal={isSignalColor}>
	<div class="elapsed">{elapsed}</div>
	<!-- Always mounted so warning escalation does not reflow the meters header. -->
	<div class="remaining" class:remaining-live={showRemaining && Boolean(remaining)}>
		{#if showRemaining && remaining}
			{remaining} left
		{/if}
	</div>
</div>

<style>
	.timer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.elapsed {
		font-size: var(--text-timer);
		font-weight: 600;
		font-family: var(--font-mono);
		line-height: 1;
		letter-spacing: 0.02em;
	}

	.remaining {
		min-height: calc(var(--text-annotation) * 1.2);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1.2;
		color: var(--ink-muted);
		visibility: hidden;
	}

	.remaining.remaining-live {
		visibility: visible;
	}

	.signal .elapsed {
		color: var(--signal);
	}

	.signal .remaining {
		color: var(--signal);
	}
</style>
