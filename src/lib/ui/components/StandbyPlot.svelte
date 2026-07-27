<script lang="ts">
	/**
	 * Idle Capture plot. Scan travels right→left to match live-wave scroll
	 * (newest energy enters on the right; older samples leave left).
	 */
	let {
		ariaLabel = 'Capture plot on standby'
	}: {
		ariaLabel?: string;
	} = $props();

	const SCAN_PERIOD_MS = 5200;

	let frame: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let cssWidth = $state(0);
	let cssHeight = $state(0);

	function readCssVar(name: string, fallback: string): string {
		if (!frame) return fallback;
		const value = getComputedStyle(frame).getPropertyValue(name).trim();
		return value || fallback;
	}

	function draw(scanX: number | null) {
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
		const lineStrong = readCssVar('--line-strong', '#85857f');
		const midY = cssHeight / 2;
		const tick = 6;

		ctx.strokeStyle = line;
		ctx.lineWidth = 1;

		// Zero axis — same mid-lane geometry as LiveWaveform (cssHeight / 2).
		ctx.beginPath();
		ctx.moveTo(0, midY);
		ctx.lineTo(cssWidth, midY);
		ctx.stroke();

		// End caps on the zero axis.
		ctx.beginPath();
		ctx.moveTo(0, midY - tick);
		ctx.lineTo(0, midY + tick);
		ctx.moveTo(cssWidth, midY - tick);
		ctx.lineTo(cssWidth, midY + tick);
		ctx.stroke();

		// Amplitude ticks on both edges (±¼, ±½).
		const ampMarks = [0.25, 0.5, 0.75];
		ctx.beginPath();
		for (const t of ampMarks) {
			const y = cssHeight * t;
			ctx.moveTo(0, y);
			ctx.lineTo(tick, y);
			ctx.moveTo(cssWidth, y);
			ctx.lineTo(cssWidth - tick, y);
		}
		ctx.stroke();

		// Soft instrument scan — right→left like live scroll, not a fake waveform.
		if (scanX !== null && cssWidth > 0) {
			const x = Math.max(0, Math.min(cssWidth, scanX));
			const edgeFade = Math.min(1, Math.min(x, cssWidth - x) / 24);
			const alpha = 0.35 + 0.45 * edgeFade;
			const half = 14;

			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = lineStrong;
			ctx.beginPath();
			ctx.moveTo(x, midY - half);
			ctx.lineTo(x, midY + half);
			ctx.stroke();

			ctx.fillStyle = lineStrong;
			ctx.beginPath();
			ctx.arc(x, midY, 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
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
		draw(null);
		return () => {
			if (canvas === node) canvas = undefined;
		};
	}

	$effect(() => {
		void cssWidth;
		void cssHeight;

		if (typeof window === 'undefined') return;

		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		let raf = 0;
		let start = performance.now();

		function paintStatic() {
			draw(cssWidth / 2);
		}

		function tick(now: number) {
			if (document.visibilityState === 'hidden' || motionQuery.matches) {
				paintStatic();
				return;
			}
			const progress = ((now - start) % SCAN_PERIOD_MS) / SCAN_PERIOD_MS;
			// Right→left: progress 0 at right edge, 1 at left (live-wave scroll direction).
			draw((1 - progress) * cssWidth);
			raf = requestAnimationFrame(tick);
		}

		function startLoop() {
			cancelAnimationFrame(raf);
			if (motionQuery.matches || cssWidth <= 0 || cssHeight <= 0) {
				paintStatic();
				return;
			}
			start = performance.now();
			raf = requestAnimationFrame(tick);
		}

		function onMotionChange() {
			startLoop();
		}

		function onVisibility() {
			if (document.visibilityState === 'visible') startLoop();
			else {
				cancelAnimationFrame(raf);
				paintStatic();
			}
		}

		startLoop();
		motionQuery.addEventListener('change', onMotionChange);
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			cancelAnimationFrame(raf);
			motionQuery.removeEventListener('change', onMotionChange);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<div class="standby-plot" {@attach observeFrame} role="img" aria-label={ariaLabel}>
	<canvas {@attach bindCanvas}></canvas>
</div>

<style>
	.standby-plot {
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
