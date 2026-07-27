<script lang="ts">
	import { formatUploadStateLabel, type TakeUploadState } from '$lib/domain';
	import { Icon } from '$lib/ui/icons';

	type ChipPhase = 'local' | 'queued' | 'busy' | 'uploaded' | 'failed';

	let {
		uploadState,
		savedLocally = false
	}: {
		uploadState?: TakeUploadState | string;
		savedLocally?: boolean;
	} = $props();

	const phase = $derived.by((): ChipPhase | null => {
		const state = uploadState as TakeUploadState | undefined;
		if (state === 'failed') return 'failed';
		if (state === 'uploaded') return 'uploaded';
		if (state === 'queued') return 'queued';
		if (
			state === 'rendering' ||
			state === 'encoding' ||
			state === 'uploading' ||
			state === 'processing'
		) {
			return 'busy';
		}
		if (savedLocally || state === 'not-queued' || state == null) {
			return savedLocally || state === 'not-queued' ? 'local' : null;
		}
		return null;
	});

	const ariaLabel = $derived.by(() => {
		if (phase == null) return '';
		if (phase === 'busy' && uploadState) {
			return formatUploadStateLabel(uploadState as TakeUploadState);
		}
		switch (phase) {
			case 'local':
				return 'Local file';
			case 'queued':
				return 'Queued';
			case 'uploaded':
				return 'Uploaded';
			case 'failed':
				return 'Upload failed';
			default:
				return 'Uploading';
		}
	});

	let chipEl: HTMLSpanElement | undefined = $state();
	let contentEl: HTMLSpanElement | undefined = $state();
	let widthPx = $state(0);
	let widthReady = $state(false);

	$effect(() => {
		void phase;
		const chip = chipEl;
		const content = contentEl;
		if (!chip || !content || phase == null) return;

		const cs = getComputedStyle(chip);
		const chrome =
			(parseFloat(cs.paddingLeft) || 0) +
			(parseFloat(cs.paddingRight) || 0) +
			(parseFloat(cs.borderLeftWidth) || 0) +
			(parseFloat(cs.borderRightWidth) || 0);
		const next = Math.ceil(content.getBoundingClientRect().width + chrome);
		if (next > 0) widthPx = next;

		if (!widthReady) {
			const frame = requestAnimationFrame(() => {
				widthReady = true;
			});
			return () => cancelAnimationFrame(frame);
		}
	});
</script>

{#if phase}
	<span
		bind:this={chipEl}
		class="chip"
		class:ready={widthReady}
		data-phase={phase}
		role="status"
		aria-label={ariaLabel}
		style:width={widthPx > 0 ? `${widthPx}px` : undefined}
	>
		<span class="content" bind:this={contentEl}>
			{#if phase === 'local'}
				<span class="label">Local file</span>
			{:else if phase === 'queued'}
				<span class="label">Queued</span>
			{:else if phase === 'busy'}
				<span class="spinner" aria-hidden="true">
					<span class="spinner-ring"></span>
				</span>
			{:else if phase === 'uploaded'}
				<span class="glyph" aria-hidden="true">
					<Icon name="check" size={12} />
				</span>
			{:else}
				<span class="label">Failed</span>
			{/if}
		</span>
	</span>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		min-height: 0;
		padding: 0 var(--space-2);
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--radius-round);
		background: var(--surface);
		color: var(--ink);
		font-size: var(--text-micro);
		font-weight: 600;
		letter-spacing: 0.03em;
		line-height: 1.2;
		text-transform: uppercase;
		white-space: nowrap;
		vertical-align: middle;
	}

	.chip.ready {
		transition:
			width 280ms ease,
			padding 280ms ease,
			background-color 220ms ease,
			border-color 220ms ease,
			color 220ms ease;
	}

	.content {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.label {
		display: inline-block;
	}

	.glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.spinner {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--space-3);
		height: var(--space-3);
	}

	.spinner-ring {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		border: 1px solid color-mix(in srgb, var(--ink) 22%, transparent);
		border-top-color: var(--ink);
		border-radius: var(--radius-round);
	}

	.chip[data-phase='local'] {
		border-color: var(--signal);
		color: var(--signal);
		background: var(--surface);
	}

	.chip[data-phase='queued'] {
		border-color: var(--brand);
		background: var(--brand-soft);
		color: var(--ink);
	}

	.chip[data-phase='busy'] {
		padding: 0 var(--space-2);
		border-color: var(--line-strong);
		background: var(--surface);
		color: var(--ink);
	}

	.chip[data-phase='uploaded'] {
		padding: 0 var(--space-2);
		border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
		background: var(--brand-soft);
		color: color-mix(in srgb, var(--brand) 35%, var(--ink));
	}

	.chip[data-phase='failed'] {
		border-color: var(--signal);
		background: var(--signal);
		color: var(--surface);
	}

	@media (prefers-reduced-motion: no-preference) {
		.chip[data-phase='queued'] {
			animation: armed-breathe 1.8s ease-in-out infinite;
		}

		.spinner-ring {
			animation: spin 700ms linear infinite;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chip.ready {
			transition:
				background-color 120ms ease,
				border-color 120ms ease,
				color 120ms ease;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes armed-breathe {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand) 0%, transparent);
		}

		50% {
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 28%, transparent);
		}
	}
</style>
