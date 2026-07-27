<script lang="ts">
	import type { CapturePeakBucket } from '$lib/audio/capture';

	let {
		peaks,
		peakCount,
		clipping = false,
		active = true
	}: {
		peaks: readonly CapturePeakBucket[];
		/** Reactive length so in-place peak pushes still redraw. */
		peakCount: number;
		clipping?: boolean;
		active?: boolean;
	} = $props();

	let frame: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let cssWidth = $state(0);
	let cssHeight = $state(0);

	function readCssVar(name: string, fallback: string): string {
		if (!frame) return fallback;
		const value = getComputedStyle(frame).getPropertyValue(name).trim();
		return value || fallback;
	}

	function draw() {
		if (!canvas || cssWidth <= 0 || cssHeight <= 0) return;

		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const width = Math.floor(cssWidth * dpr);
		const height = Math.floor(cssHeight * dpr);
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cssWidth, cssHeight);

		const line = readCssVar('--line', '#c9c9c3');
		const ink = readCssVar('--ink', '#111111');
		const signal = readCssVar('--signal', '#ff1f2e');
		const muted = readCssVar('--ink-muted', '#5c5c58');

		const midY = cssHeight / 2;
		ctx.strokeStyle = line;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(cssWidth, midY);
		ctx.stroke();

		const count = Math.max(0, Math.min(peakCount, peaks.length));
		if (count === 0) {
			ctx.fillStyle = muted;
			ctx.font = '600 11px var(--font-mono), monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(active ? 'Waiting for input…' : '—', cssWidth / 2, midY);
			return;
		}

		// Fixed window: 1 CSS px = 1 analyser bucket (LIVE_PEAK_INTERVAL_MS). Newest at right;
		// older buckets scroll off the left once the lane is full.
		const columns = Math.max(1, Math.floor(cssWidth));
		const visible = Math.min(count, columns);
		const peakStart = count - visible;
		const xOffset = columns - visible;
		ctx.fillStyle = clipping ? signal : ink;

		for (let i = 0; i < visible; i += 1) {
			const bucket = peaks[peakStart + i];
			if (!bucket) continue;
			const { min, max } = bucket;
			if (max < min) continue;

			const y1 = midY - max * midY;
			const y2 = midY - min * midY;
			const top = Math.min(y1, y2);
			const bottom = Math.max(y1, y2);
			const h = Math.max(1, bottom - top);
			ctx.fillRect(xOffset + i, top, 1, h);
		}
	}

	function observeFrame(node: HTMLDivElement) {
		frame = node;
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			cssWidth = entry.contentRect.width;
			cssHeight = entry.contentRect.height;
		});
		ro.observe(node);
		return () => {
			ro.disconnect();
			if (frame === node) frame = undefined;
		};
	}

	function bindCanvas(node: HTMLCanvasElement) {
		canvas = node;
		draw();
		return () => {
			if (canvas === node) canvas = undefined;
		};
	}

	$effect(() => {
		void peakCount;
		void clipping;
		void active;
		void cssWidth;
		void cssHeight;
		draw();
	});
</script>

<div
	class="live-wave"
	class:inactive={!active}
	{@attach observeFrame}
	role="img"
	aria-label="Live recording waveform"
>
	<canvas {@attach bindCanvas}></canvas>
</div>

<style>
	.live-wave {
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.live-wave.inactive {
		opacity: 0.6;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
