<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import {
		computePeaksWindowFromPlanar,
		needsDetailPeaks,
		resamplePeaksWindow
	} from '$lib/audio/peaks';
	import type { DecodedPlanarAudio } from '$lib/audio/decode';
	import { MIN_SEGMENT_SECONDS } from '$lib/domain/edit-recipe';
	import {
		MIN_VIEW_SPAN,
		ZOOM_STEP_IN,
		ZOOM_STEP_OUT,
		clampView,
		fitFull,
		fitSelectionWindow,
		panView,
		viewZoomLevel,
		zoomView,
		type ViewWindow
	} from './view-window';

	let {
		data,
		channels,
		peakCount,
		durationSeconds,
		currentTime = 0,
		analyzing = false,
		error = null,
		chrome = 'panel',
		/** When true with stage chrome, zoom + navigator render into `chromeHost` (take dock). */
		dockChrome = false,
		chromeHost = null,
		/** Optional actions rendered to the right of stage zoom controls (e.g. Normalize / Trim / Extract). */
		chromeActions = undefined,
		selectionStart = $bindable(null),
		selectionEnd = $bindable(null),
		retainedRanges = undefined,
		/** Stable id for the take/source so detail PCM cache resets on navigation. */
		detailSourceKey = null,
		/** Lazy full decode for sample-accurate peaks when zoomed past overview density. */
		ensureDetailPcm = undefined,
		onSeek,
		onRetry,
		onSelectionChange,
		onTrimBoundaryCommit,
		onFadeBoundaryCommit
	}: {
		data: Float32Array | null;
		channels: number;
		peakCount: number;
		durationSeconds: number;
		currentTime?: number;
		analyzing?: boolean;
		error?: string | null;
		/** `'stage'` = flush on page paper (take editor). `'panel'` = bordered card chrome. */
		chrome?: 'panel' | 'stage';
		dockChrome?: boolean;
		chromeHost?: HTMLElement | null;
		chromeActions?: Snippet;
		selectionStart?: number | null;
		selectionEnd?: number | null;
		retainedRanges?: Array<{
			start: number;
			end: number;
			fadeInSeconds?: number;
			fadeOutSeconds?: number;
		}>;
		detailSourceKey?: string | null;
		ensureDetailPcm?: () => Promise<DecodedPlanarAudio | null>;
		onSeek?: (seconds: number) => void;
		onRetry?: () => void;
		onSelectionChange?: (start: number, end: number) => void;
		onTrimBoundaryCommit?: (detail: {
			rangeIndex: number;
			edge: 'start' | 'end';
			seconds: number;
		}) => void;
		/** Fade duration in seconds; fade-in starts at trim start, fade-out ends at trim end. */
		onFadeBoundaryCommit?: (detail: { edge: 'in' | 'out'; seconds: number }) => void;
	} = $props();

	type RetainedRange = {
		start: number;
		end: number;
		fadeInSeconds: number;
		fadeOutSeconds: number;
	};

	const isStage = $derived(chrome === 'stage');
	/** Take dock: suppress inline chrome until the host element exists (avoids under-wave flash). */
	const showDockedChrome = $derived(isStage && dockChrome && chromeHost != null);
	const showInlineStageChrome = $derived(isStage && !dockChrome);
	const showPanelNav = $derived(!isStage);
	const showStatusFacts = $derived(!isStage);
	const showStatusLine = $derived(showStatusFacts || analyzing || Boolean(error));

	function portalTo(target: HTMLElement): Attachment<HTMLElement> {
		return (node) => {
			target.appendChild(node);
			return () => {
				node.remove();
			};
		};
	}

	/** Visible window as fractions of total duration [0, 1]. */
	let viewStart = $state(0);
	let viewEnd = $state(1);

	let frame: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let navCanvas: HTMLCanvasElement | undefined;
	let cssWidth = $state(0);
	let cssHeight = $state(0);
	let navWidth = $state(0);
	let navHeight = $state(0);

	/** Live preview while dragging a trim or fade marker (null = use prop). */
	let previewRetainedRanges = $state.raw<RetainedRange[] | null>(null);
	let mainCursor = $state('crosshair');

	/** Cached planar PCM for zoomed sample-accurate drawing (main waveform only). */
	let detailPcm = $state.raw<DecodedPlanarAudio | null>(null);
	/** Non-reactive: which `detailSourceKey` `detailPcm` belongs to. */
	let detailForKey: string | null = null;

	const DRAG_THRESHOLD_PX = 4;
	const NAV_EDGE_HIT_PX = 14;
	const TRIM_EDGE_HIT_PX = 14;
	/** Same hit radius as trim — selection edges use ink grips, not signal. */
	const SELECTION_EDGE_HIT_PX = TRIM_EDGE_HIT_PX;
	/** Tick/label band inside the time ruler. */
	const RULER_CONTENT_HEIGHT_PX = 22;
	/** Extra ruler height below ticks — fade grip tabs sit here. */
	const RULER_BOTTOM_PAD_PX = 14;
	/** Full time-ruler band (content + bottom pad). */
	const RULER_HEIGHT_PX = RULER_CONTENT_HEIGHT_PX + RULER_BOTTOM_PAD_PX;
	const WHEEL_ZOOM_SENSITIVITY = 0.0025;
	const PINCH_ZOOM_SENSITIVITY = 1;

	const TRIM_CURSOR = 'col-resize';
	const SELECTION_MOVE_CURSOR = 'grab';
	const SELECTION_MOVE_ACTIVE_CURSOR = 'grabbing';

	const zoomLevel = $derived(viewZoomLevel({ start: viewStart, end: viewEnd }));
	const isZoomed = $derived(viewEnd - viewStart < 1 - 1e-6);
	const channelMode = $derived(channels > 1 ? 'split' : 'mono');
	const viewSpan = $derived(viewEnd - viewStart);
	const wantsDetail = $derived(
		needsDetailPeaks(peakCount, viewSpan, Math.max(1, Math.floor(cssWidth)))
	);

	const hasSelection = $derived(
		selectionStart != null &&
			selectionEnd != null &&
			Number.isFinite(selectionStart) &&
			Number.isFinite(selectionEnd)
	);

	const selectionLo = $derived(
		hasSelection ? Math.min(selectionStart as number, selectionEnd as number) : null
	);
	const selectionHi = $derived(
		hasSelection ? Math.max(selectionStart as number, selectionEnd as number) : null
	);

	const canFitSelection = $derived(
		selectionLo != null && selectionHi != null && selectionHi > selectionLo && durationSeconds > 0
	);

	/** Bounding box of committed retained ranges (not live drag preview). */
	const trimFitBounds = $derived.by(() => {
		if (!retainedRanges || retainedRanges.length === 0 || !(durationSeconds > 0)) return null;
		const sorted = [...retainedRanges]
			.map((r) => ({
				start: Math.max(0, Math.min(durationSeconds, r.start)),
				end: Math.max(0, Math.min(durationSeconds, r.end))
			}))
			.filter((r) => r.end > r.start)
			.sort((a, b) => a.start - b.start);
		if (sorted.length === 0) return null;
		const start = sorted[0]!.start;
		const end = sorted[sorted.length - 1]!.end;
		if (!(end > start)) return null;
		return { start, end };
	});

	const canFitTrim = $derived(trimFitBounds != null);

	function readCssVar(name: string, fallback: string): string {
		if (!frame) return fallback;
		const value = getComputedStyle(frame).getPropertyValue(name).trim();
		return value || fallback;
	}

	function formatClock(seconds: number): string {
		const clamped = Math.max(0, seconds);
		const mins = Math.floor(clamped / 60);
		const secs = clamped - mins * 60;
		const whole = Math.floor(secs);
		const ms = Math.floor((secs - whole) * 1000);
		return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	}

	function chooseTickStep(viewDuration: number): { major: number; minor: number } {
		const candidates = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
		const targetMajors = 6;
		let major = candidates[candidates.length - 1] ?? 60;
		for (const step of candidates) {
			if (viewDuration / step <= targetMajors) {
				major = step;
				break;
			}
		}
		const minor = major / 4;
		return { major, minor };
	}

	function applyView(next: ViewWindow) {
		viewStart = next.start;
		viewEnd = next.end;
	}

	function fit() {
		applyView(fitFull());
	}

	function fitToSelection() {
		if (selectionLo == null || selectionHi == null) return;
		applyView(fitSelectionWindow(selectionLo, selectionHi, durationSeconds));
		lastSelectionFitKey = selectionFitKey(selectionLo, selectionHi);
	}

	function fitToTrim() {
		if (!trimFitBounds) return;
		applyView(fitSelectionWindow(trimFitBounds.start, trimFitBounds.end, durationSeconds));
		lastTrimFitKey = trimFitKey(trimFitBounds.start, trimFitBounds.end);
	}

	function fitViewToRetainedBounds(ranges: RetainedRange[]) {
		if (!(durationSeconds > 0) || ranges.length === 0) return;
		const sorted = [...ranges]
			.map((r) => ({
				start: Math.max(0, Math.min(durationSeconds, r.start)),
				end: Math.max(0, Math.min(durationSeconds, r.end))
			}))
			.filter((r) => r.end > r.start)
			.sort((a, b) => a.start - b.start);
		if (sorted.length === 0) return;
		const start = sorted[0]!.start;
		const end = sorted[sorted.length - 1]!.end;
		if (!(end > start)) return;
		applyView(fitSelectionWindow(start, end, durationSeconds));
		lastTrimFitKey = trimFitKey(start, end);
	}

	function selectionFitKey(lo: number, hi: number): string {
		return `${detailSourceKey ?? ''}:${lo.toFixed(6)}:${hi.toFixed(6)}`;
	}

	function trimFitKey(start: number, end: number): string {
		return `${detailSourceKey ?? ''}:${start.toFixed(6)}:${end.toFixed(6)}`;
	}

	/** Navigator double-click: Fit when zoomed; else Sel → Trim → no-op. */
	function onNavDoubleClick() {
		if (analyzing || !data) return;
		if (isZoomed) {
			fit();
			return;
		}
		if (canFitSelection) {
			fitToSelection();
			return;
		}
		if (canFitTrim) {
			fitToTrim();
		}
	}

	function buttonAnchorAbs(): number {
		if (selectionLo != null && selectionHi != null && durationSeconds > 0) {
			return (selectionLo + selectionHi) / 2 / durationSeconds;
		}
		if (durationSeconds > 0 && Number.isFinite(currentTime)) {
			return Math.max(0, Math.min(1, currentTime / durationSeconds));
		}
		return (viewStart + viewEnd) / 2;
	}

	function zoomBy(factor: number) {
		applyView(zoomView({ start: viewStart, end: viewEnd }, factor, buttonAnchorAbs()));
	}

	function absAtClientX(clientX: number, width: number, el: HTMLElement): number | null {
		if (width <= 0) return null;
		const rect = el.getBoundingClientRect();
		const x = Math.max(0, Math.min(width, clientX - rect.left));
		return viewStart + (x / width) * (viewEnd - viewStart);
	}

	function timeAtClientX(clientX: number): number | null {
		if (!canvas || cssWidth <= 0 || durationSeconds <= 0) return null;
		const abs = absAtClientX(clientX, cssWidth, canvas);
		if (abs == null) return null;
		return abs * durationSeconds;
	}

	function commitSelection(start: number, end: number) {
		const lo = Math.min(start, end);
		const hi = Math.max(start, end);
		selectionStart = lo;
		selectionEnd = hi;
		onSelectionChange?.(lo, hi);
	}

	function xForTime(t: number, t0: number, viewDur: number, width: number): number {
		return ((t - t0) / viewDur) * width;
	}

	/** Integer CSS px for a trim boundary — shared by canvas markers and DOM grips. */
	function boundaryMarkerX(t: number, t0: number, viewDur: number, width: number): number {
		return Math.round(xForTime(t, t0, viewDur, width));
	}

	/**
	 * 2px `--signal` column at a retained edge. Start sits to the right of the time
	 * ([x, x+2]); end sits to the left ([x-2, x]) so DOM stems can share the same box.
	 */
	function fillBoundaryMarker(
		ctx: CanvasRenderingContext2D,
		x: number,
		edge: 'start' | 'end',
		y0: number,
		y1: number
	) {
		const left = edge === 'start' ? x : x - 2;
		ctx.fillRect(left, y0, 2, Math.max(1, y1 - y0));
	}

	function timeInRetained(seconds: number, ranges: RetainedRange[]): boolean {
		for (const range of ranges) {
			if (seconds >= range.start && seconds <= range.end) return true;
		}
		return false;
	}

	/** Linear fade gain at a source time within retained audio (1 outside fades). */
	function fadeGainAt(seconds: number, ranges: RetainedRange[]): number {
		for (const range of ranges) {
			if (seconds < range.start || seconds > range.end) continue;
			let gain = 1;
			const fadeIn = range.fadeInSeconds;
			const fadeOut = range.fadeOutSeconds;
			const length = range.end - range.start;
			if (fadeIn > 0 && seconds < range.start + fadeIn) {
				gain *= length <= 0 ? 0 : (seconds - range.start) / fadeIn;
			}
			if (fadeOut > 0 && seconds > range.end - fadeOut) {
				gain *= length <= 0 ? 0 : (range.end - seconds) / fadeOut;
			}
			return Math.max(0, Math.min(1, gain));
		}
		return 1;
	}

	function normalizeRetainedRange(range: {
		start: number;
		end: number;
		fadeInSeconds?: number;
		fadeOutSeconds?: number;
	}): RetainedRange {
		const start = Math.max(0, Math.min(durationSeconds, range.start));
		const end = Math.max(0, Math.min(durationSeconds, range.end));
		const length = Math.max(0, end - start);
		let fadeIn = Math.max(0, range.fadeInSeconds ?? 0);
		let fadeOut = Math.max(0, range.fadeOutSeconds ?? 0);
		const sum = fadeIn + fadeOut;
		if (sum > length && sum > 0) {
			const scale = length / sum;
			fadeIn *= scale;
			fadeOut *= scale;
		} else {
			fadeIn = Math.min(fadeIn, length);
			fadeOut = Math.min(fadeOut, length);
		}
		return {
			start,
			end,
			fadeInSeconds: fadeIn,
			fadeOutSeconds: fadeOut
		};
	}

	/** True when any source time outside retained ranges exists (trimmed / cut material). */
	function hasDiscardedRegions(): boolean {
		const sorted = sortedRetainedRanges();
		if (sorted.length === 0 || durationSeconds <= 0) return false;
		if (sorted[0]!.start > 1e-9) return true;
		if (sorted[sorted.length - 1]!.end < durationSeconds - 1e-6) return true;
		for (let i = 1; i < sorted.length; i += 1) {
			if (sorted[i]!.start - sorted[i - 1]!.end > 1e-9) return true;
		}
		return false;
	}

	/** Wash over discarded (non-retained) source — reads as off / not in the upload. */
	function drawDiscardedRegions(
		ctx: CanvasRenderingContext2D,
		waveTop: number,
		waveH: number,
		t0: number,
		t1: number,
		viewDur: number,
		width: number,
		fill: string
	) {
		const sorted = sortedRetainedRanges();
		if (sorted.length === 0) return;

		ctx.fillStyle = fill;
		ctx.globalAlpha = 0.38;

		let cursor = 0;
		for (const range of sorted) {
			if (range.start > cursor) {
				const lo = Math.max(cursor, t0);
				const hi = Math.min(range.start, t1);
				if (hi > lo) {
					const x0 = xForTime(lo, t0, viewDur, width);
					const x1 = xForTime(hi, t0, viewDur, width);
					ctx.fillRect(x0, waveTop, Math.max(1, x1 - x0), waveH);
				}
			}
			cursor = Math.max(cursor, range.end);
		}
		if (cursor < durationSeconds) {
			const lo = Math.max(cursor, t0);
			const hi = Math.min(durationSeconds, t1);
			if (hi > lo) {
				const x0 = xForTime(lo, t0, viewDur, width);
				const x1 = xForTime(hi, t0, viewDur, width);
				ctx.fillRect(x0, waveTop, Math.max(1, x1 - x0), waveH);
			}
		}

		ctx.globalAlpha = 1;
	}

	function sortedRetainedRanges(): RetainedRange[] {
		const source = previewRetainedRanges ?? retainedRanges;
		if (!source || source.length === 0 || durationSeconds <= 0) return [];
		return [...source]
			.map((r) => normalizeRetainedRange(r))
			.filter((r) => r.end > r.start)
			.sort((a, b) => a.start - b.start);
	}

	/** DOM grip handles for retained edges in (or near) the visible view. */
	type TrimHandle = {
		key: string;
		rangeIndex: number;
		edge: 'start' | 'end';
		x: number;
		label: string;
	};

	const visibleTrimHandles = $derived.by((): TrimHandle[] => {
		if (analyzing || !data || cssWidth <= 0 || durationSeconds <= 0) return [];
		const ranges = sortedRetainedRanges();
		if (ranges.length === 0) return [];

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		/* Half touch target — show grips that sit just off-screen at the edges. */
		const marginT = ((TRIM_EDGE_HIT_PX + 8) / cssWidth) * viewDur;
		const multi = ranges.length > 1;
		const handles: TrimHandle[] = [];

		for (let i = 0; i < ranges.length; i += 1) {
			const range = ranges[i]!;
			for (const edge of ['start', 'end'] as const) {
				const edgeT = range[edge];
				if (edgeT < t0 - marginT || edgeT > t1 + marginT) continue;
				const edgeLabel = edge === 'start' ? 'Trim start' : 'Trim end';
				handles.push({
					key: `${i}-${edge}`,
					rangeIndex: i,
					edge,
					x: boundaryMarkerX(edgeT, t0, viewDur, cssWidth),
					label: multi ? `${edgeLabel}, range ${i + 1}` : edgeLabel
				});
			}
		}
		return handles;
	});

	/** Fade grips: fade-in on earliest retained start, fade-out on latest retained end. */
	type FadeHandle = {
		key: string;
		edge: 'in' | 'out';
		rangeIndex: number;
		x: number;
		label: string;
	};

	const visibleFadeHandles = $derived.by((): FadeHandle[] => {
		if (analyzing || !data || cssWidth <= 0 || durationSeconds <= 0) return [];
		const ranges = sortedRetainedRanges();
		if (ranges.length === 0) return [];

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		const marginT = ((TRIM_EDGE_HIT_PX + 8) / cssWidth) * viewDur;
		const handles: FadeHandle[] = [];

		const first = ranges[0]!;
		const fadeInT = first.start + first.fadeInSeconds;
		if (fadeInT >= t0 - marginT && fadeInT <= t1 + marginT) {
			handles.push({
				key: 'fade-in',
				edge: 'in',
				rangeIndex: 0,
				x: boundaryMarkerX(fadeInT, t0, viewDur, cssWidth),
				label: 'Fade in'
			});
		}

		const lastIndex = ranges.length - 1;
		const last = ranges[lastIndex]!;
		const fadeOutT = last.end - last.fadeOutSeconds;
		if (fadeOutT >= t0 - marginT && fadeOutT <= t1 + marginT) {
			handles.push({
				key: 'fade-out',
				edge: 'out',
				rangeIndex: lastIndex,
				x: boundaryMarkerX(fadeOutT, t0, viewDur, cssWidth),
				label: 'Fade out'
			});
		}

		return handles;
	});

	/** DOM grip handles for selection start/end in (or near) the visible view. */
	type SelectionHandle = {
		key: string;
		edge: 'start' | 'end';
		x: number;
		label: string;
	};

	const visibleSelectionHandles = $derived.by((): SelectionHandle[] => {
		if (analyzing || !data || cssWidth <= 0 || durationSeconds <= 0) return [];
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) return [];

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		const marginT = ((SELECTION_EDGE_HIT_PX + 8) / cssWidth) * viewDur;
		const handles: SelectionHandle[] = [];

		for (const edge of ['start', 'end'] as const) {
			const edgeT = edge === 'start' ? selectionLo : selectionHi;
			if (edgeT < t0 - marginT || edgeT > t1 + marginT) continue;
			handles.push({
				key: `sel-${edge}`,
				edge,
				x: boundaryMarkerX(edgeT, t0, viewDur, cssWidth),
				label: edge === 'start' ? 'Selection start' : 'Selection end'
			});
		}
		return handles;
	});

	/** Draw linear fade envelopes (amplitude ramp) — ink diagonals, distinct from signal trim marks. */
	function drawFadeEnvelopes(
		ctx: CanvasRenderingContext2D,
		waveTop: number,
		waveH: number,
		t0: number,
		t1: number,
		viewDur: number,
		width: number,
		stroke: string
	) {
		const ranges = sortedRetainedRanges();
		if (ranges.length === 0) return;

		const waveBottom = waveTop + waveH;
		ctx.strokeStyle = stroke;
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.globalAlpha = 0.9;

		for (const range of ranges) {
			if (range.fadeInSeconds > 1e-6) {
				const fadeEnd = range.start + range.fadeInSeconds;
				const lo = Math.max(range.start, t0);
				const hi = Math.min(fadeEnd, t1);
				if (hi > lo) {
					const x0 = xForTime(range.start, t0, viewDur, width);
					const x1 = xForTime(fadeEnd, t0, viewDur, width);
					ctx.beginPath();
					ctx.moveTo(x0, waveBottom);
					ctx.lineTo(x1, waveTop);
					ctx.stroke();
				}
			}
			if (range.fadeOutSeconds > 1e-6) {
				const fadeStart = range.end - range.fadeOutSeconds;
				const lo = Math.max(fadeStart, t0);
				const hi = Math.min(range.end, t1);
				if (hi > lo) {
					const x0 = xForTime(fadeStart, t0, viewDur, width);
					const x1 = xForTime(range.end, t0, viewDur, width);
					ctx.beginPath();
					ctx.moveTo(x0, waveTop);
					ctx.lineTo(x1, waveBottom);
					ctx.stroke();
				}
			}
		}

		ctx.setLineDash([]);
		ctx.globalAlpha = 1;
	}

	/** 2px `--signal` columns at retained (trim) boundaries — heavier than 1px selection/playhead. */
	function drawRetainedBoundaryMarkers(
		ctx: CanvasRenderingContext2D,
		y0: number,
		y1: number,
		t0: number,
		t1: number,
		viewDur: number,
		width: number,
		stroke: string
	) {
		const sorted = sortedRetainedRanges();
		if (sorted.length === 0) return;

		ctx.fillStyle = stroke;
		for (const range of sorted) {
			for (const edge of ['start', 'end'] as const) {
				const edgeT = range[edge];
				if (edgeT < t0 || edgeT > t1) continue;
				fillBoundaryMarker(ctx, boundaryMarkerX(edgeT, t0, viewDur, width), edge, y0, y1);
			}
		}
	}

	function drawPeaks(
		ctx: CanvasRenderingContext2D,
		waveTop: number,
		waveH: number,
		width: number,
		vStart: number,
		vEnd: number,
		showLabels: boolean,
		forceCombined = false,
		allowDetail = false,
		/** When set, peak columns outside retained ranges use this fill (discarded / off). */
		discardedPeakFill: string | null = null
	) {
		if (!data || peakCount <= 0 || channels <= 0) return;

		const columns = Math.max(1, Math.floor(width));
		const span = Math.max(0, vEnd - vStart);
		const useDetail =
			allowDetail &&
			detailPcm != null &&
			detailPcm.frameCount > 0 &&
			detailPcm.channels.length > 0 &&
			needsDetailPeaks(peakCount, span, columns);

		const drawChannels = useDetail ? detailPcm!.channels.length : channels;
		let windowed: Float32Array;
		if (useDetail) {
			const frameCount = detailPcm!.frameCount;
			windowed = computePeaksWindowFromPlanar(
				detailPcm!.channels,
				vStart * frameCount,
				vEnd * frameCount,
				columns
			);
		} else {
			const startPeak = vStart * peakCount;
			const endPeak = vEnd * peakCount;
			windowed = resamplePeaksWindow(data, channels, peakCount, startPeak, endPeak, columns);
		}

		const useSplit = channelMode === 'split' && !forceCombined;
		const laneCount = useSplit ? drawChannels : 1;
		const laneGap = useSplit && showLabels ? 8 : 0;
		const laneH = (waveH - laneGap * (laneCount - 1)) / laneCount;
		const ink = readCssVar('--ink', '#111111');
		const line = readCssVar('--line', '#c9c9c3');
		const muted = readCssVar('--ink-muted', '#5c5c58');
		const retainedForPeaks =
			discardedPeakFill && durationSeconds > 0 ? sortedRetainedRanges() : [];
		const colorPeaks = retainedForPeaks.length > 0 && discardedPeakFill != null;
		const viewDurAbs = Math.max(1e-6, (vEnd - vStart) * durationSeconds);
		const fadeRanges = sortedRetainedRanges();
		const applyFadeViz = fadeRanges.some(
			(r) => r.fadeInSeconds > 1e-6 || r.fadeOutSeconds > 1e-6
		);

		for (let lane = 0; lane < laneCount; lane += 1) {
			const y0 = waveTop + lane * (laneH + laneGap);
			const midY = y0 + laneH / 2;

			ctx.strokeStyle = line;
			ctx.beginPath();
			ctx.moveTo(0, midY);
			ctx.lineTo(width, midY);
			ctx.stroke();

			if (showLabels && useSplit) {
				ctx.fillStyle = muted;
				ctx.font = '600 10px var(--font-mono), monospace';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				ctx.fillText(lane === 0 ? 'L' : lane === 1 ? 'R' : `C${lane + 1}`, 4, y0 + 2);
			}

			ctx.fillStyle = ink;
			const chIndex = useSplit ? lane : 0;

			for (let col = 0; col < columns; col += 1) {
				let min = 1;
				let max = -1;
				if (!useSplit && drawChannels > 1) {
					for (let ch = 0; ch < drawChannels; ch += 1) {
						const base = ch * columns * 2 + col * 2;
						const cMin = windowed[base] ?? 0;
						const cMax = windowed[base + 1] ?? 0;
						if (cMin < min) min = cMin;
						if (cMax > max) max = cMax;
					}
				} else {
					const base = chIndex * columns * 2 + col * 2;
					min = windowed[base] ?? 0;
					max = windowed[base + 1] ?? 0;
				}
				if (max < min) continue;
				const tMid = vStart * durationSeconds + ((col + 0.5) / columns) * viewDurAbs;
				if (applyFadeViz) {
					const gain = fadeGainAt(tMid, fadeRanges);
					min *= gain;
					max *= gain;
				}
				const y1 = midY - max * (laneH / 2);
				const y2 = midY - min * (laneH / 2);
				const top = Math.min(y1, y2);
				const bottom = Math.max(y1, y2);
				if (colorPeaks) {
					ctx.fillStyle = timeInRetained(tMid, retainedForPeaks)
						? ink
						: discardedPeakFill!;
				}
				ctx.fillRect(col, top, 1, Math.max(1, bottom - top));
			}
		}

		if (showLabels && !useSplit && drawChannels > 1) {
			ctx.fillStyle = muted;
			ctx.font = '600 10px var(--font-mono), monospace';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'top';
			ctx.fillText('COMBINED', 4, waveTop + 2);
		}
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

		const paper = isStage
			? readCssVar('--paper', '#f7f7f3')
			: readCssVar('--surface', '#ffffff');
		const line = readCssVar('--line', '#c9c9c3');
		const ink = readCssVar('--ink', '#111111');
		const signal = readCssVar('--signal', '#e43b2f');
		const muted = readCssVar('--ink-muted', '#5c5c58');
		const subtle = readCssVar('--surface-subtle', '#efefeb');
		const disabled = readCssVar('--disabled', '#a8a8a2');

		ctx.fillStyle = paper;
		ctx.fillRect(0, 0, cssWidth, cssHeight);

		const rulerH = RULER_HEIGHT_PX;
		const rulerContentH = RULER_CONTENT_HEIGHT_PX;
		const waveTop = rulerH;
		const waveH = Math.max(1, cssHeight - rulerH);

		ctx.fillStyle = isStage ? paper : subtle;
		ctx.fillRect(0, 0, cssWidth, rulerH);
		ctx.strokeStyle = line;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, rulerH - 0.5);
		ctx.lineTo(cssWidth, rulerH - 0.5);
		ctx.stroke();

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		const { major, minor } = chooseTickStep(viewDur);

		ctx.fillStyle = muted;
		ctx.font = '600 11px var(--font-mono), monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';

		const firstMinor = Math.ceil(t0 / minor) * minor;
		for (let t = firstMinor; t <= t1 + 1e-9; t += minor) {
			const x = ((t - t0) / viewDur) * cssWidth;
			const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
			ctx.strokeStyle = line;
			ctx.beginPath();
			/* Start in the label band; extend through the bottom pad to the wave divider. */
			ctx.moveTo(x + 0.5, rulerContentH - (isMajor ? 10 : 5));
			ctx.lineTo(x + 0.5, rulerH);
			ctx.stroke();
			if (isMajor && x > 4 && x < cssWidth - 40) {
				ctx.fillText(formatClock(t), x + 3, rulerContentH / 2);
			}
		}

		if (analyzing || !data || peakCount <= 0 || channels <= 0) {
			ctx.fillStyle = muted;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = '600 12px var(--font-mono), monospace';
			const message = analyzing ? 'ANALYZING WAVEFORM' : error ? error : 'No waveform data';
			ctx.fillText(message, cssWidth / 2, waveTop + waveH / 2);
			return;
		}

		const showDiscarded = hasDiscardedRegions();
		if (showDiscarded) {
			drawDiscardedRegions(ctx, waveTop, waveH, t0, t1, viewDur, cssWidth, disabled);
		}
		drawPeaks(
			ctx,
			waveTop,
			waveH,
			cssWidth,
			viewStart,
			viewEnd,
			true,
			false,
			true,
			showDiscarded ? disabled : null
		);
		drawFadeEnvelopes(ctx, waveTop, waveH, t0, t1, viewDur, cssWidth, ink);
		drawRetainedBoundaryMarkers(ctx, waveTop, waveTop + waveH, t0, t1, viewDur, cssWidth, signal);

		if (selectionLo != null && selectionHi != null && selectionHi > selectionLo) {
			const selStart = Math.max(selectionLo, t0);
			const selEnd = Math.min(selectionHi, t1);
			if (selEnd > selStart) {
				const x0 = xForTime(selStart, t0, viewDur, cssWidth);
				const x1 = xForTime(selEnd, t0, viewDur, cssWidth);
				ctx.fillStyle = ink;
				ctx.globalAlpha = 0.12;
				ctx.fillRect(x0, waveTop, Math.max(1, x1 - x0), waveH);
				ctx.globalAlpha = 1;

				ctx.strokeStyle = ink;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x0 + 0.5, waveTop);
				ctx.lineTo(x0 + 0.5, waveTop + waveH);
				ctx.moveTo(x1 + 0.5, waveTop);
				ctx.lineTo(x1 + 0.5, waveTop + waveH);
				ctx.stroke();
			}
		}

		if (durationSeconds > 0 && currentTime >= t0 && currentTime <= t1) {
			const x = ((currentTime - t0) / viewDur) * cssWidth;
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x + 0.5, 0);
			ctx.lineTo(x + 0.5, cssHeight);
			ctx.stroke();
		}
	}

	function drawNavigator() {
		if (!navCanvas || navWidth <= 0 || navHeight <= 0) return;

		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const width = Math.floor(navWidth * dpr);
		const height = Math.floor(navHeight * dpr);
		if (navCanvas.width !== width || navCanvas.height !== height) {
			navCanvas.width = width;
			navCanvas.height = height;
		}

		const ctx = navCanvas.getContext('2d');
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, navWidth, navHeight);

		const paper = isStage
			? readCssVar('--paper', '#f7f7f3')
			: readCssVar('--surface', '#ffffff');
		const subtle = readCssVar('--surface-subtle', '#efefeb');
		const line = readCssVar('--line', '#c9c9c3');
		const ink = readCssVar('--ink', '#111111');
		const signal = readCssVar('--signal', '#e43b2f');
		const muted = readCssVar('--ink-muted', '#5c5c58');
		const disabled = readCssVar('--disabled', '#a8a8a2');

		ctx.fillStyle = isStage ? paper : subtle;
		ctx.fillRect(0, 0, navWidth, navHeight);

		if (analyzing || !data || peakCount <= 0 || channels <= 0) {
			ctx.fillStyle = muted;
			ctx.font = '600 10px var(--font-mono), monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(analyzing ? '…' : 'NO WAVEFORM', navWidth / 2, navHeight / 2);
			return;
		}

		const showDiscarded = hasDiscardedRegions();
		if (showDiscarded) {
			drawDiscardedRegions(
				ctx,
				0,
				navHeight,
				0,
				durationSeconds,
				Math.max(1e-6, durationSeconds),
				navWidth,
				disabled
			);
		}
		drawPeaks(ctx, 0, navHeight, navWidth, 0, 1, false, true, false, showDiscarded ? disabled : null);

		const x0 = viewStart * navWidth;
		const x1 = viewEnd * navWidth;

		ctx.fillStyle = paper;
		ctx.globalAlpha = 0.55;
		ctx.fillRect(0, 0, x0, navHeight);
		ctx.fillRect(x1, 0, Math.max(0, navWidth - x1), navHeight);
		ctx.globalAlpha = 1;

		drawFadeEnvelopes(
			ctx,
			0,
			navHeight,
			0,
			durationSeconds,
			Math.max(1e-6, durationSeconds),
			navWidth,
			ink
		);
		drawRetainedBoundaryMarkers(
			ctx,
			0,
			navHeight,
			0,
			durationSeconds,
			Math.max(1e-6, durationSeconds),
			navWidth,
			signal
		);

		ctx.strokeStyle = ink;
		ctx.lineWidth = 2;
		ctx.strokeRect(x0 + 0.5, 1.5, Math.max(2, x1 - x0 - 1), navHeight - 3);

		ctx.fillStyle = ink;
		ctx.fillRect(x0, 0, 3, navHeight);
		ctx.fillRect(Math.max(0, x1 - 3), 0, 3, navHeight);

		if (durationSeconds > 0) {
			const px = (currentTime / durationSeconds) * navWidth;
			ctx.strokeStyle = ink;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(px + 0.5, 0);
			ctx.lineTo(px + 0.5, navHeight);
			ctx.stroke();
		}

		ctx.strokeStyle = line;
		ctx.lineWidth = 1;
		if (!isStage) {
			ctx.strokeRect(0.5, 0.5, navWidth - 1, navHeight - 1);
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

	function observeNav(node: HTMLDivElement) {
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			navWidth = entry.contentRect.width;
			navHeight = entry.contentRect.height;
		});
		ro.observe(node);
		return () => ro.disconnect();
	}

	function bindCanvas(node: HTMLCanvasElement) {
		canvas = node;
		draw();

		const stopWheel = on(
			node,
			'wheel',
			(event: WheelEvent) => {
				if (analyzing || !data) return;
				const zoomGesture = event.ctrlKey || event.metaKey;
				if (zoomGesture) {
					event.preventDefault();
					const abs = absAtClientX(event.clientX, cssWidth, node);
					if (abs == null) return;
					const factor = Math.exp(event.deltaY * WHEEL_ZOOM_SENSITIVITY);
					applyView(zoomView({ start: viewStart, end: viewEnd }, factor, abs));
					return;
				}
				if (!isZoomed) return;
				event.preventDefault();
				const span = viewEnd - viewStart;
				const dx = event.deltaX !== 0 ? event.deltaX : event.deltaY;
				applyView(panView({ start: viewStart, end: viewEnd }, (dx / cssWidth) * span));
			},
			{ passive: false }
		);

		return () => {
			stopWheel();
			if (canvas === node) canvas = undefined;
		};
	}

	function bindNavCanvas(node: HTMLCanvasElement) {
		navCanvas = node;
		drawNavigator();

		const stopWheel = on(
			node,
			'wheel',
			(event: WheelEvent) => {
				if (analyzing || !data || navWidth <= 0) return;
				if (event.deltaY === 0) return;
				event.preventDefault();
				const rect = node.getBoundingClientRect();
				const x = Math.max(0, Math.min(navWidth, event.clientX - rect.left));
				const abs = navWidth > 0 ? x / navWidth : 0.5;
				const factor = Math.exp(event.deltaY * WHEEL_ZOOM_SENSITIVITY);
				applyView(zoomView({ start: viewStart, end: viewEnd }, factor, abs));
			},
			{ passive: false }
		);

		return () => {
			stopWheel();
			if (navCanvas === node) navCanvas = undefined;
		};
	}

	type PointerSample = { id: number; x: number; y: number };

	const activePointers = new Map<number, PointerSample>();
	let pinchState: { distance: number; midX: number; midAbs: number } | null = null;
	let panDrag: { originX: number; originStart: number; originEnd: number } | null = null;
	let selectDrag: {
		pointerId: number;
		originX: number;
		originTime: number;
		dragged: boolean;
	} | null = null;
	/** Skip selection auto-fit while a selection gesture is in progress. */
	let suppressSelectionFit = $state(false);
	let lastSelectionFitKey = '';
	/** Skip trim auto-fit while a trim-edge gesture is in progress. */
	let suppressTrimFit = $state(false);
	let lastTrimFitKey = '';

	let selectionEdgeDrag = $state.raw<{
		pointerId: number;
		edge: 'start' | 'end';
		originLo: number;
		originHi: number;
		currentLo: number;
		currentHi: number;
		dragged: boolean;
	} | null>(null);
	let selectionMoveDrag = $state.raw<{
		pointerId: number;
		originTime: number;
		originLo: number;
		originHi: number;
		span: number;
		currentLo: number;
		currentHi: number;
		dragged: boolean;
	} | null>(null);

	function endSelectionGesture() {
		selectDrag = null;
		selectionEdgeDrag = null;
		selectionMoveDrag = null;
		suppressSelectionFit = false;
	}

	function endTrimGesture() {
		trimDrag = null;
		suppressTrimFit = false;
	}
	let trimDrag = $state.raw<{
		pointerId: number;
		rangeIndex: number;
		edge: 'start' | 'end';
		prevEnd: number;
		nextStart: number;
		minSeconds: number;
		originSeconds: number;
		currentSeconds: number;
		dragged: boolean;
	} | null>(null);
	let fadeDrag = $state.raw<{
		pointerId: number;
		edge: 'in' | 'out';
		rangeIndex: number;
		rangeStart: number;
		rangeEnd: number;
		maxFade: number;
		originFadeSeconds: number;
		currentFadeSeconds: number;
		dragged: boolean;
	} | null>(null);
	let navDrag:
		| { mode: 'move'; originX: number; originStart: number; originEnd: number }
		| { mode: 'start' | 'end'; other: number }
		| null = null;
	let navCursor = $state('default');

	function hitTrimEdge(clientX: number): { rangeIndex: number; edge: 'start' | 'end' } | null {
		if (!canvas || cssWidth <= 0 || durationSeconds <= 0) return null;
		const ranges = sortedRetainedRanges();
		if (ranges.length === 0) return null;

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		const rect = canvas.getBoundingClientRect();
		const x = clientX - rect.left;

		let best: { rangeIndex: number; edge: 'start' | 'end'; dist: number } | null = null;
		for (let i = 0; i < ranges.length; i += 1) {
			const range = ranges[i]!;
			for (const edge of ['start', 'end'] as const) {
				const edgeT = range[edge];
				if (edgeT < t0 - 1e-9 || edgeT > t1 + 1e-9) continue;
				const edgeX = boundaryMarkerX(edgeT, t0, viewDur, cssWidth);
				/* Hit the center of the 2px marker column (start [x,x+2], end [x-2,x]). */
				const markerMid = edge === 'start' ? edgeX + 1 : edgeX - 1;
				const dist = Math.abs(x - markerMid);
				if (dist <= TRIM_EDGE_HIT_PX && (!best || dist < best.dist)) {
					best = { rangeIndex: i, edge, dist };
				}
			}
		}
		return best ? { rangeIndex: best.rangeIndex, edge: best.edge } : null;
	}

	function hitSelectionEdge(clientX: number): 'start' | 'end' | null {
		if (!canvas || cssWidth <= 0 || durationSeconds <= 0) return null;
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) return null;

		const t0 = viewStart * durationSeconds;
		const t1 = viewEnd * durationSeconds;
		const viewDur = Math.max(1e-6, t1 - t0);
		const rect = canvas.getBoundingClientRect();
		const x = clientX - rect.left;

		let best: { edge: 'start' | 'end'; dist: number } | null = null;
		for (const edge of ['start', 'end'] as const) {
			const edgeT = edge === 'start' ? selectionLo : selectionHi;
			if (edgeT < t0 - 1e-9 || edgeT > t1 + 1e-9) continue;
			const edgeX = boundaryMarkerX(edgeT, t0, viewDur, cssWidth);
			const dist = Math.abs(x - edgeX);
			if (dist <= SELECTION_EDGE_HIT_PX && (!best || dist < best.dist)) {
				best = { edge, dist };
			}
		}
		return best?.edge ?? null;
	}

	function hitSelectionBody(clientX: number): boolean {
		if (!canvas || cssWidth <= 0 || durationSeconds <= 0) return false;
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) return false;
		const time = timeAtClientX(clientX);
		if (time == null) return false;
		return time >= selectionLo && time <= selectionHi;
	}

	function clampSelectionEdge(
		edge: 'start' | 'end',
		seconds: number,
		lo: number,
		hi: number
	): { lo: number; hi: number } {
		if (edge === 'start') {
			const nextLo = Math.min(
				Math.max(0, seconds),
				hi - MIN_SEGMENT_SECONDS
			);
			return { lo: nextLo, hi };
		}
		const nextHi = Math.max(
			Math.min(durationSeconds, seconds),
			lo + MIN_SEGMENT_SECONDS
		);
		return { lo, hi: nextHi };
	}

	function clampSelectionMove(originLo: number, span: number, deltaSeconds: number): {
		lo: number;
		hi: number;
	} {
		const maxLo = Math.max(0, durationSeconds - span);
		const lo = Math.max(0, Math.min(maxLo, originLo + deltaSeconds));
		return { lo, hi: lo + span };
	}

	function beginSelectionEdgeDrag(
		pointerId: number,
		edge: 'start' | 'end',
		captureTarget?: HTMLElement
	): boolean {
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) return false;

		selectDrag = null;
		selectionMoveDrag = null;
		panDrag = null;
		endTrimGesture();
		fadeDrag = null;
		previewRetainedRanges = null;

		suppressSelectionFit = true;
		selectionEdgeDrag = {
			pointerId,
			edge,
			originLo: selectionLo,
			originHi: selectionHi,
			currentLo: selectionLo,
			currentHi: selectionHi,
			dragged: false
		};
		mainCursor = TRIM_CURSOR;
		if (captureTarget) {
			try {
				captureTarget.setPointerCapture(pointerId);
			} catch {
				/* already released / unsupported */
			}
		}
		return true;
	}

	function updateSelectionEdgeDragFromClientX(clientX: number) {
		if (!selectionEdgeDrag) return;
		const next = timeAtClientX(clientX);
		if (next == null) return;
		const { lo, hi } = clampSelectionEdge(
			selectionEdgeDrag.edge,
			next,
			selectionEdgeDrag.originLo,
			selectionEdgeDrag.originHi
		);
		if (
			!selectionEdgeDrag.dragged &&
			Math.abs(lo - selectionEdgeDrag.originLo) < 1e-4 &&
			Math.abs(hi - selectionEdgeDrag.originHi) < 1e-4
		) {
			return;
		}
		selectionEdgeDrag = {
			...selectionEdgeDrag,
			currentLo: lo,
			currentHi: hi,
			dragged: true
		};
		commitSelection(lo, hi);
		mainCursor = TRIM_CURSOR;
	}

	function commitSelectionEdgeDrag(
		pointerId: number,
		clientX: number,
		releaseTarget?: EventTarget | null
	): boolean {
		const wasEdge = selectionEdgeDrag;
		if (!wasEdge || pointerId !== wasEdge.pointerId) return false;

		selectionEdgeDrag = null;
		suppressSelectionFit = false;
		if (releaseTarget && 'releasePointerCapture' in releaseTarget) {
			try {
				(releaseTarget as HTMLElement).releasePointerCapture(pointerId);
			} catch {
				/* already released */
			}
		}
		syncMainCursor(clientX);
		return true;
	}

	function beginSelectionMoveDrag(
		pointerId: number,
		originTime: number,
		captureTarget?: HTMLElement
	): boolean {
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) return false;

		selectDrag = null;
		selectionEdgeDrag = null;
		panDrag = null;
		endTrimGesture();
		fadeDrag = null;
		previewRetainedRanges = null;

		const span = selectionHi - selectionLo;
		suppressSelectionFit = true;
		selectionMoveDrag = {
			pointerId,
			originTime,
			originLo: selectionLo,
			originHi: selectionHi,
			span,
			currentLo: selectionLo,
			currentHi: selectionHi,
			dragged: false
		};
		mainCursor = SELECTION_MOVE_ACTIVE_CURSOR;
		if (captureTarget) {
			try {
				captureTarget.setPointerCapture(pointerId);
			} catch {
				/* already released / unsupported */
			}
		}
		return true;
	}

	function updateSelectionMoveDragFromClientX(clientX: number) {
		if (!selectionMoveDrag) return;
		const next = timeAtClientX(clientX);
		if (next == null) return;
		const delta = next - selectionMoveDrag.originTime;
		const { lo, hi } = clampSelectionMove(
			selectionMoveDrag.originLo,
			selectionMoveDrag.span,
			delta
		);
		if (
			!selectionMoveDrag.dragged &&
			Math.abs(lo - selectionMoveDrag.originLo) < 1e-4 &&
			Math.abs(hi - selectionMoveDrag.originHi) < 1e-4
		) {
			return;
		}
		selectionMoveDrag = {
			...selectionMoveDrag,
			currentLo: lo,
			currentHi: hi,
			dragged: true
		};
		commitSelection(lo, hi);
		mainCursor = SELECTION_MOVE_ACTIVE_CURSOR;
	}

	function commitSelectionMoveDrag(
		pointerId: number,
		clientX: number,
		releaseTarget?: EventTarget | null
	): boolean {
		const wasMove = selectionMoveDrag;
		if (!wasMove || pointerId !== wasMove.pointerId) return false;

		selectionMoveDrag = null;
		suppressSelectionFit = false;
		if (releaseTarget && 'releasePointerCapture' in releaseTarget) {
			try {
				(releaseTarget as HTMLElement).releasePointerCapture(pointerId);
			} catch {
				/* already released */
			}
		}
		syncMainCursor(clientX);
		return true;
	}

	function clampTrimEdgeSeconds(
		rangeIndex: number,
		edge: 'start' | 'end',
		seconds: number,
		ranges: RetainedRange[],
		prevEnd: number,
		nextStart: number
	): number {
		const range = ranges[rangeIndex];
		if (!range) return seconds;
		if (edge === 'start') {
			return Math.min(Math.max(seconds, prevEnd), range.end - MIN_SEGMENT_SECONDS);
		}
		return Math.max(Math.min(seconds, nextStart), range.start + MIN_SEGMENT_SECONDS);
	}

	function applyTrimPreview(seconds: number) {
		if (!trimDrag) return;
		const base = previewRetainedRanges ?? sortedRetainedRanges();
		const next = base.map((range) => ({ ...range }));
		const range = next[trimDrag.rangeIndex];
		if (!range) return;
		const clamped = clampTrimEdgeSeconds(
			trimDrag.rangeIndex,
			trimDrag.edge,
			seconds,
			next,
			trimDrag.prevEnd,
			trimDrag.nextStart
		);
		if (trimDrag.edge === 'start') range.start = clamped;
		else range.end = clamped;
		const length = Math.max(0, range.end - range.start);
		const sum = range.fadeInSeconds + range.fadeOutSeconds;
		if (sum > length && sum > 0) {
			const scale = length / sum;
			range.fadeInSeconds *= scale;
			range.fadeOutSeconds *= scale;
		} else {
			range.fadeInSeconds = Math.min(range.fadeInSeconds, length);
			range.fadeOutSeconds = Math.min(range.fadeOutSeconds, length);
		}
		trimDrag.currentSeconds = clamped;
		previewRetainedRanges = next;
	}

	function beginTrimDrag(
		pointerId: number,
		rangeIndex: number,
		edge: 'start' | 'end',
		captureTarget?: HTMLElement
	): boolean {
		const ranges = sortedRetainedRanges();
		const range = ranges[rangeIndex];
		if (!range) return false;

		endSelectionGesture();
		panDrag = null;
		fadeDrag = null;
		const prevEnd = rangeIndex > 0 ? ranges[rangeIndex - 1]!.end : 0;
		const nextStart =
			rangeIndex < ranges.length - 1 ? ranges[rangeIndex + 1]!.start : durationSeconds;
		const originSeconds = edge === 'start' ? range.start : range.end;
		suppressTrimFit = true;
		trimDrag = {
			pointerId,
			rangeIndex,
			edge,
			prevEnd,
			nextStart,
			minSeconds: MIN_SEGMENT_SECONDS,
			originSeconds,
			currentSeconds: originSeconds,
			dragged: false
		};
		previewRetainedRanges = ranges.map((entry) => ({ ...entry }));
		mainCursor = TRIM_CURSOR;
		if (captureTarget) {
			try {
				captureTarget.setPointerCapture(pointerId);
			} catch {
				/* already released / unsupported */
			}
		}
		return true;
	}

	function updateTrimDragFromClientX(clientX: number) {
		if (!trimDrag) return;
		const next = timeAtClientX(clientX);
		if (next == null) return;
		if (!trimDrag.dragged && Math.abs(next - trimDrag.originSeconds) < 1e-4) return;
		trimDrag.dragged = true;
		applyTrimPreview(next);
		mainCursor = TRIM_CURSOR;
	}

	function commitTrimDrag(
		pointerId: number,
		clientX: number,
		releaseTarget?: EventTarget | null
	): boolean {
		const wasTrim = trimDrag;
		if (!wasTrim || pointerId !== wasTrim.pointerId) return false;

		trimDrag = null;
		const committedSeconds = wasTrim.currentSeconds;
		const dragged = wasTrim.dragged;
		const preview = previewRetainedRanges;
		previewRetainedRanges = null;
		suppressTrimFit = false;
		if (releaseTarget && 'releasePointerCapture' in releaseTarget) {
			try {
				(releaseTarget as HTMLElement).releasePointerCapture(pointerId);
			} catch {
				/* already released */
			}
		}
		if (dragged && Math.abs(committedSeconds - wasTrim.originSeconds) > 1e-6) {
			onTrimBoundaryCommit?.({
				rangeIndex: wasTrim.rangeIndex,
				edge: wasTrim.edge,
				seconds: committedSeconds
			});
			if (preview) fitViewToRetainedBounds(preview);
		}
		syncMainCursor(clientX);
		return true;
	}

	function applyFadePreview(fadeSeconds: number) {
		if (!fadeDrag) return;
		const base = previewRetainedRanges ?? sortedRetainedRanges();
		const next = base.map((range) => ({ ...range }));
		const range = next[fadeDrag.rangeIndex];
		if (!range) return;
		const clamped = Math.max(0, Math.min(fadeSeconds, fadeDrag.maxFade));
		if (fadeDrag.edge === 'in') range.fadeInSeconds = clamped;
		else range.fadeOutSeconds = clamped;
		fadeDrag.currentFadeSeconds = clamped;
		previewRetainedRanges = next;
	}

	function beginFadeDrag(
		pointerId: number,
		edge: 'in' | 'out',
		rangeIndex: number,
		captureTarget?: HTMLElement
	): boolean {
		const ranges = sortedRetainedRanges();
		const range = ranges[rangeIndex];
		if (!range) return false;

		endSelectionGesture();
		panDrag = null;
		endTrimGesture();
		const length = Math.max(0, range.end - range.start);
		const otherFade = edge === 'in' ? range.fadeOutSeconds : range.fadeInSeconds;
		const maxFade = Math.max(0, length - otherFade);
		const originFadeSeconds = edge === 'in' ? range.fadeInSeconds : range.fadeOutSeconds;
		fadeDrag = {
			pointerId,
			edge,
			rangeIndex,
			rangeStart: range.start,
			rangeEnd: range.end,
			maxFade,
			originFadeSeconds,
			currentFadeSeconds: originFadeSeconds,
			dragged: false
		};
		previewRetainedRanges = ranges.map((entry) => ({ ...entry }));
		mainCursor = TRIM_CURSOR;
		if (captureTarget) {
			try {
				captureTarget.setPointerCapture(pointerId);
			} catch {
				/* already released / unsupported */
			}
		}
		return true;
	}

	function updateFadeDragFromClientX(clientX: number) {
		if (!fadeDrag) return;
		const next = timeAtClientX(clientX);
		if (next == null) return;
		const fadeSeconds =
			fadeDrag.edge === 'in'
				? next - fadeDrag.rangeStart
				: fadeDrag.rangeEnd - next;
		const clamped = Math.max(0, Math.min(fadeSeconds, fadeDrag.maxFade));
		if (!fadeDrag.dragged && Math.abs(clamped - fadeDrag.originFadeSeconds) < 1e-4) return;
		fadeDrag.dragged = true;
		applyFadePreview(clamped);
		mainCursor = TRIM_CURSOR;
	}

	function commitFadeDrag(
		pointerId: number,
		clientX: number,
		releaseTarget?: EventTarget | null
	): boolean {
		const wasFade = fadeDrag;
		if (!wasFade || pointerId !== wasFade.pointerId) return false;

		fadeDrag = null;
		const committed = wasFade.currentFadeSeconds;
		const dragged = wasFade.dragged;
		previewRetainedRanges = null;
		if (releaseTarget && 'releasePointerCapture' in releaseTarget) {
			try {
				(releaseTarget as HTMLElement).releasePointerCapture(pointerId);
			} catch {
				/* already released */
			}
		}
		if (dragged && Math.abs(committed - wasFade.originFadeSeconds) > 1e-6) {
			onFadeBoundaryCommit?.({
				edge: wasFade.edge,
				seconds: committed
			});
		}
		syncMainCursor(clientX);
		return true;
	}

	function onTrimHandlePointerDown(
		event: PointerEvent,
		rangeIndex: number,
		edge: 'start' | 'end'
	) {
		if (analyzing || !data) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		beginTrimDrag(event.pointerId, rangeIndex, edge, event.currentTarget as HTMLElement);
	}

	function onTrimHandlePointerMove(event: PointerEvent) {
		if (!trimDrag || event.pointerId !== trimDrag.pointerId) return;
		event.preventDefault();
		updateTrimDragFromClientX(event.clientX);
	}

	function onTrimHandlePointerUp(event: PointerEvent) {
		if (!trimDrag || event.pointerId !== trimDrag.pointerId) return;
		event.preventDefault();
		commitTrimDrag(event.pointerId, event.clientX, event.currentTarget);
	}

	function onFadeHandlePointerDown(event: PointerEvent, edge: 'in' | 'out', rangeIndex: number) {
		if (analyzing || !data) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		beginFadeDrag(event.pointerId, edge, rangeIndex, event.currentTarget as HTMLElement);
	}

	function onFadeHandlePointerMove(event: PointerEvent) {
		if (!fadeDrag || event.pointerId !== fadeDrag.pointerId) return;
		event.preventDefault();
		updateFadeDragFromClientX(event.clientX);
	}

	function onFadeHandlePointerUp(event: PointerEvent) {
		if (!fadeDrag || event.pointerId !== fadeDrag.pointerId) return;
		event.preventDefault();
		commitFadeDrag(event.pointerId, event.clientX, event.currentTarget);
	}

	function onSelectionHandlePointerDown(event: PointerEvent, edge: 'start' | 'end') {
		if (analyzing || !data) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		beginSelectionEdgeDrag(event.pointerId, edge, event.currentTarget as HTMLElement);
	}

	function onSelectionHandlePointerMove(event: PointerEvent) {
		if (!selectionEdgeDrag || event.pointerId !== selectionEdgeDrag.pointerId) return;
		event.preventDefault();
		updateSelectionEdgeDragFromClientX(event.clientX);
	}

	function onSelectionHandlePointerUp(event: PointerEvent) {
		if (!selectionEdgeDrag || event.pointerId !== selectionEdgeDrag.pointerId) return;
		event.preventDefault();
		commitSelectionEdgeDrag(event.pointerId, event.clientX, event.currentTarget);
	}

	function syncMainCursor(clientX: number) {
		if (analyzing || !data) {
			mainCursor = 'default';
			return;
		}
		if (trimDrag || fadeDrag || hitTrimEdge(clientX)) {
			mainCursor = TRIM_CURSOR;
			return;
		}
		if (selectionEdgeDrag || hitSelectionEdge(clientX)) {
			mainCursor = TRIM_CURSOR;
			return;
		}
		if (selectionMoveDrag) {
			mainCursor = SELECTION_MOVE_ACTIVE_CURSOR;
			return;
		}
		if (hitSelectionBody(clientX)) {
			mainCursor = SELECTION_MOVE_CURSOR;
			return;
		}
		mainCursor = 'crosshair';
	}

	function cursorForNavMode(mode: 'start' | 'end' | 'move' | 'jump', dragging: boolean): string {
		if (mode === 'start' || mode === 'end') return 'ew-resize';
		if (mode === 'move') return dragging ? 'grabbing' : 'grab';
		return 'pointer';
	}

	function syncNavCursor(clientX: number, dragging = navDrag != null) {
		if (analyzing || !data) {
			navCursor = 'default';
			return;
		}
		const mode = navDrag?.mode ?? navHitMode(clientX);
		navCursor = cursorForNavMode(mode, dragging);
	}

	function pointerDistance(a: PointerSample, b: PointerSample): number {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function syncPinchFromPointers() {
		if (activePointers.size !== 2 || !canvas || cssWidth <= 0) {
			pinchState = null;
			return;
		}
		const [a, b] = [...activePointers.values()];
		if (!a || !b) return;
		const midX = (a.x + b.x) / 2;
		const mid = absAtClientX(midX, cssWidth, canvas);
		if (mid == null) return;
		pinchState = { distance: Math.max(1, pointerDistance(a, b)), midX, midAbs: mid };
	}

	function onMainPointerDown(event: PointerEvent) {
		if (analyzing || !data || !canvas) return;
		if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
		event.preventDefault();

		const target = event.currentTarget as HTMLCanvasElement;
		target.setPointerCapture(event.pointerId);
		activePointers.set(event.pointerId, {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY
		});

		const shiftPan = event.shiftKey || event.button === 1;
		if (shiftPan && event.isPrimary) {
			endSelectionGesture();
			endTrimGesture();
			fadeDrag = null;
			previewRetainedRanges = null;
			panDrag = {
				originX: event.clientX,
				originStart: viewStart,
				originEnd: viewEnd
			};
			return;
		}

		if (activePointers.size >= 2) {
			endSelectionGesture();
			endTrimGesture();
			fadeDrag = null;
			previewRetainedRanges = null;
			panDrag = null;
			syncPinchFromPointers();
			return;
		}

		const trimHit = hitTrimEdge(event.clientX);
		if (trimHit && event.isPrimary) {
			if (beginTrimDrag(event.pointerId, trimHit.rangeIndex, trimHit.edge)) {
				return;
			}
		}

		const selectionEdge = hitSelectionEdge(event.clientX);
		if (selectionEdge && event.isPrimary) {
			if (beginSelectionEdgeDrag(event.pointerId, selectionEdge)) {
				return;
			}
		}

		const time = timeAtClientX(event.clientX);
		if (time == null) {
			activePointers.delete(event.pointerId);
			try {
				target.releasePointerCapture(event.pointerId);
			} catch {
				/* already released */
			}
			return;
		}

		if (hitSelectionBody(event.clientX) && event.isPrimary) {
			if (beginSelectionMoveDrag(event.pointerId, time)) {
				return;
			}
		}

		selectDrag = {
			pointerId: event.pointerId,
			originX: event.clientX,
			originTime: time,
			dragged: false
		};
		suppressSelectionFit = true;
	}

	function onMainPointerMove(event: PointerEvent) {
		if (!activePointers.has(event.pointerId)) {
			syncMainCursor(event.clientX);
			return;
		}
		activePointers.set(event.pointerId, {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY
		});

		if (activePointers.size >= 2 && canvas && cssWidth > 0) {
			endSelectionGesture();
			if (trimDrag || fadeDrag) {
				endTrimGesture();
				fadeDrag = null;
				previewRetainedRanges = null;
			}
			panDrag = null;
			const [a, b] = [...activePointers.values()];
			if (!a || !b) return;
			const distance = Math.max(1, pointerDistance(a, b));
			const midX = (a.x + b.x) / 2;
			if (!pinchState) {
				const mid = absAtClientX(midX, cssWidth, canvas);
				if (mid == null) return;
				pinchState = { distance, midX, midAbs: mid };
				return;
			}
			const factor = Math.pow(pinchState.distance / distance, PINCH_ZOOM_SENSITIVITY);
			let next = zoomView({ start: viewStart, end: viewEnd }, factor, pinchState.midAbs);
			const span = next.end - next.start;
			const dx = midX - pinchState.midX;
			next = panView(next, -(dx / cssWidth) * span);
			applyView(next);
			const mid = absAtClientX(midX, cssWidth, canvas);
			pinchState = {
				distance,
				midX,
				midAbs: mid ?? pinchState.midAbs
			};
			return;
		}

		if (panDrag && cssWidth > 0) {
			const span = panDrag.originEnd - panDrag.originStart;
			const deltaAbs = ((panDrag.originX - event.clientX) / cssWidth) * span;
			applyView(panView({ start: panDrag.originStart, end: panDrag.originEnd }, deltaAbs));
			return;
		}

		if (trimDrag && event.pointerId === trimDrag.pointerId) {
			updateTrimDragFromClientX(event.clientX);
			return;
		}

		if (fadeDrag && event.pointerId === fadeDrag.pointerId) {
			updateFadeDragFromClientX(event.clientX);
			return;
		}

		if (selectionEdgeDrag && event.pointerId === selectionEdgeDrag.pointerId) {
			updateSelectionEdgeDragFromClientX(event.clientX);
			return;
		}

		if (selectionMoveDrag && event.pointerId === selectionMoveDrag.pointerId) {
			updateSelectionMoveDragFromClientX(event.clientX);
			return;
		}

		if (selectDrag && event.pointerId === selectDrag.pointerId) {
			const dx = Math.abs(event.clientX - selectDrag.originX);
			if (!selectDrag.dragged && dx < DRAG_THRESHOLD_PX) return;
			selectDrag.dragged = true;
			const next = timeAtClientX(event.clientX);
			if (next == null) return;
			commitSelection(selectDrag.originTime, next);
		}
	}

	function onMainPointerUp(event: PointerEvent) {
		const wasSelect = selectDrag;
		activePointers.delete(event.pointerId);
		if (activePointers.size < 2) pinchState = null;
		else syncPinchFromPointers();

		if (activePointers.size === 0) {
			panDrag = null;
		}

		if (commitTrimDrag(event.pointerId, event.clientX, event.currentTarget)) {
			return;
		}

		if (commitFadeDrag(event.pointerId, event.clientX, event.currentTarget)) {
			return;
		}

		if (commitSelectionEdgeDrag(event.pointerId, event.clientX, event.currentTarget)) {
			return;
		}

		if (commitSelectionMoveDrag(event.pointerId, event.clientX, event.currentTarget)) {
			return;
		}

		if (wasSelect && event.pointerId === wasSelect.pointerId) {
			endSelectionGesture();
			try {
				(event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
			} catch {
				/* already released */
			}
			if (!wasSelect.dragged && !event.shiftKey && event.button !== 1) {
				const seekTime = timeAtClientX(event.clientX) ?? wasSelect.originTime;
				onSeek?.(seekTime);
			}
		} else {
			try {
				(event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
			} catch {
				/* already released */
			}
		}
		syncMainCursor(event.clientX);
	}

	function onMainPointerLeave() {
		if (trimDrag || selectionEdgeDrag || selectionMoveDrag || selectDrag || panDrag) return;
		mainCursor = 'crosshair';
	}

	function navHitMode(clientX: number): 'start' | 'end' | 'move' | 'jump' {
		if (!navCanvas || navWidth <= 0) return 'jump';
		const rect = navCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(navWidth, clientX - rect.left));
		const x0 = viewStart * navWidth;
		const x1 = viewEnd * navWidth;
		if (Math.abs(x - x0) <= NAV_EDGE_HIT_PX) return 'start';
		if (Math.abs(x - x1) <= NAV_EDGE_HIT_PX) return 'end';
		if (x >= x0 && x <= x1) return 'move';
		return 'jump';
	}

	function onNavPointerDown(event: PointerEvent) {
		if (analyzing || !data || !navCanvas || event.button !== 0) return;
		/* Let dblclick own the second click — skip jump/drag. */
		if (event.detail >= 2) {
			navDrag = null;
			return;
		}
		const target = event.currentTarget as HTMLCanvasElement;
		target.setPointerCapture(event.pointerId);
		const mode = navHitMode(event.clientX);
		const rect = navCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(navWidth, event.clientX - rect.left));
		const abs = x / navWidth;

		if (mode === 'jump') {
			const span = viewEnd - viewStart;
			applyView(clampView(abs - span / 2, abs + span / 2));
			navDrag = null;
			syncNavCursor(event.clientX, false);
			return;
		}
		if (mode === 'move') {
			navDrag = {
				mode: 'move',
				originX: event.clientX,
				originStart: viewStart,
				originEnd: viewEnd
			};
			syncNavCursor(event.clientX, true);
			return;
		}
		navDrag = {
			mode,
			other: mode === 'start' ? viewEnd : viewStart
		};
		syncNavCursor(event.clientX, true);
	}

	function onNavPointerMove(event: PointerEvent) {
		if (!navCanvas || navWidth <= 0) return;

		if (!navDrag) {
			syncNavCursor(event.clientX, false);
			return;
		}

		const rect = navCanvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(navWidth, event.clientX - rect.left));
		const abs = x / navWidth;

		if (navDrag.mode === 'move') {
			const deltaAbs = (event.clientX - navDrag.originX) / navWidth;
			applyView(panView({ start: navDrag.originStart, end: navDrag.originEnd }, deltaAbs));
			syncNavCursor(event.clientX, true);
			return;
		}
		if (navDrag.mode === 'start') {
			applyView(clampView(Math.min(abs, navDrag.other - MIN_VIEW_SPAN), navDrag.other));
			syncNavCursor(event.clientX, true);
			return;
		}
		applyView(clampView(navDrag.other, Math.max(abs, navDrag.other + MIN_VIEW_SPAN)));
		syncNavCursor(event.clientX, true);
	}

	function onNavPointerUp(event: PointerEvent) {
		navDrag = null;
		syncNavCursor(event.clientX, false);
		try {
			(event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
		} catch {
			/* already released */
		}
	}

	function onNavPointerLeave() {
		if (navDrag) return;
		navCursor = analyzing || !data ? 'default' : 'pointer';
	}

	$effect(() => {
		const key = detailSourceKey ?? null;
		const loader = ensureDetailPcm;
		const need = wantsDetail;

		if (key !== detailForKey) {
			detailForKey = key;
			detailPcm = null;
		}

		if (!loader || !key || !need) return;
		// Don't subscribe to detailPcm — async load writes it and would re-enter.
		if (untrack(() => detailPcm) != null) return;

		let cancelled = false;
		void loader()
			.then((pcm) => {
				if (cancelled || (detailSourceKey ?? null) !== key) return;
				detailForKey = key;
				detailPcm = pcm;
			})
			.catch(() => {
				/* Keep overview peaks; precise zoom stays blocky until retry. */
			});

		return () => {
			cancelled = true;
		};
	});

	/**
	 * Auto-fit when selection changes (waveform gesture release or Edit sheet inputs).
	 * Suppressed while a selection drag is active so the view doesn't chase the pointer.
	 */
	$effect(() => {
		if (suppressSelectionFit) return;
		if (selectionLo == null || selectionHi == null || !(selectionHi > selectionLo)) {
			lastSelectionFitKey = '';
			return;
		}
		if (!(durationSeconds > 0)) return;
		const key = selectionFitKey(selectionLo, selectionHi);
		if (key === lastSelectionFitKey) return;
		lastSelectionFitKey = key;
		applyView(fitSelectionWindow(selectionLo, selectionHi, durationSeconds));
	});

	/**
	 * Auto-fit when retained (trim) bounds change — open, Edit Trim/Cut/undo, or after
	 * a trim-edge gesture (gesture also fits immediately from preview).
	 */
	$effect(() => {
		if (suppressTrimFit) return;
		if (!(durationSeconds > 0) || !trimFitBounds) return;
		const { start, end } = trimFitBounds;
		const key = trimFitKey(start, end);
		if (key === lastTrimFitKey) return;
		lastTrimFitKey = key;
		applyView(fitSelectionWindow(start, end, durationSeconds));
	});

	$effect(() => {
		data;
		channels;
		peakCount;
		durationSeconds;
		currentTime;
		analyzing;
		error;
		chrome;
		viewStart;
		viewEnd;
		cssWidth;
		cssHeight;
		selectionStart;
		selectionEnd;
		retainedRanges;
		previewRetainedRanges;
		detailPcm;
		draw();
	});

	$effect(() => {
		data;
		channels;
		peakCount;
		durationSeconds;
		currentTime;
		analyzing;
		error;
		chrome;
		viewStart;
		viewEnd;
		navWidth;
		navHeight;
		retainedRanges;
		previewRetainedRanges;
		drawNavigator();
	});
</script>

{#snippet zoomControls(compact: boolean)}
	<div
		class={['zoom-controls', compact && 'zoom-compact']}
		role="group"
		aria-label="Waveform zoom"
	>
		<button
			type="button"
			class="zoom-btn"
			onclick={() => zoomBy(ZOOM_STEP_OUT)}
			disabled={analyzing || !isZoomed}
			aria-label="Zoom out"
			title="Zoom out"
		>
			−
		</button>
		<button
			type="button"
			class="zoom-btn"
			onclick={() => zoomBy(ZOOM_STEP_IN)}
			disabled={analyzing}
			aria-label="Zoom in"
			title="Zoom in"
		>
			+
		</button>
	</div>
{/snippet}

{#snippet navigator()}
	<div
		class="nav-frame"
		class:analyzing
		{@attach observeNav}
		role="img"
		aria-label="Waveform overview navigator. Drag the window to pan, drag edges to zoom, scroll to zoom, tap to jump. Double-click to fit all when zoomed, or fit selection then trim when zoomed out."
		style:cursor={navCursor}
	>
		<canvas
			{@attach bindNavCanvas}
			ondblclick={(event) => {
				event.preventDefault();
				onNavDoubleClick();
			}}
			onpointerdown={onNavPointerDown}
			onpointermove={onNavPointerMove}
			onpointerup={onNavPointerUp}
			onpointercancel={onNavPointerUp}
			onpointerleave={onNavPointerLeave}
		></canvas>
	</div>
{/snippet}

{#snippet stageNavChrome()}
	<div
		class={['stage-nav-chrome', 'chrome-stage', showDockedChrome && 'dock-target']}
		{@attach showDockedChrome && chromeHost ? portalTo(chromeHost) : undefined}
	>
		<div class="stage-chrome-toolbar">
			{@render zoomControls(true)}
			{#if chromeActions}
				<div class="chrome-actions">
					{@render chromeActions()}
				</div>
			{/if}
		</div>
		{@render navigator()}
	</div>
{/snippet}

<div class={['waveform-overview', isStage && 'chrome-stage']}>
	{#if !isStage}
		<div class="toolbar">
			{#if showStatusLine}
				<p class="status" aria-live="polite">
					{#if analyzing}
						ANALYZING WAVEFORM
					{:else if error}
						{error}
					{:else}
						{formatClock(currentTime)} / {formatClock(durationSeconds)}
						{#if isZoomed}
							· {zoomLevel.toFixed(1)}×
						{/if}
						{#if channels > 1}
							· STEREO SPLIT
						{:else}
							· MONO
						{/if}
						{#if selectionLo != null && selectionHi != null}
							· SEL {formatClock(selectionLo)}–{formatClock(selectionHi)}
						{/if}
					{/if}
				</p>
			{/if}
			{@render zoomControls(false)}
		</div>
	{:else if analyzing || error || (wantsDetail && !detailPcm && ensureDetailPcm)}
		<p class="status status-compact" aria-live="polite">
			{#if analyzing}
				ANALYZING WAVEFORM
			{:else if error}
				{error}
			{:else}
				LOADING DETAIL
			{/if}
		</p>
	{/if}

	<div class="wave-stage">
		<div class="wave-frame-host" style:--wave-ruler-h="{RULER_HEIGHT_PX}px">
			<div
				class="wave-frame"
				class:analyzing
				{@attach observeFrame}
				role="img"
				aria-label="Take waveform. Drag fade wedges at the bottom of the time ruler to set fade in/out. Drag bottom trim grips or markers to adjust retained bounds. Drag selection grips or the selection body to resize or move the selection."
				style:cursor={mainCursor}
			>
				<canvas
					{@attach bindCanvas}
					onpointerdown={onMainPointerDown}
					onpointermove={onMainPointerMove}
					onpointerup={onMainPointerUp}
					onpointercancel={onMainPointerUp}
					onpointerleave={onMainPointerLeave}
				></canvas>
			</div>

			{#each visibleFadeHandles as handle (handle.key)}
				<button
					type="button"
					class={['fade-grip', handle.edge === 'in' ? 'edge-in' : 'edge-out']}
					class:active={fadeDrag?.edge === handle.edge}
					style:left="{handle.x}px"
					style:cursor={TRIM_CURSOR}
					aria-label={handle.label}
					title={handle.label}
					disabled={analyzing || !data}
					onpointerdown={(event) =>
						onFadeHandlePointerDown(event, handle.edge, handle.rangeIndex)}
					onpointermove={onFadeHandlePointerMove}
					onpointerup={onFadeHandlePointerUp}
					onpointercancel={onFadeHandlePointerUp}
				>
					<span class="fade-grip-tab" aria-hidden="true"></span>
				</button>
			{/each}

			{#each visibleSelectionHandles as handle (handle.key)}
				<button
					type="button"
					class={[
						'selection-grip',
						handle.edge === 'start' ? 'edge-start' : 'edge-end'
					]}
					class:active={selectionEdgeDrag?.edge === handle.edge}
					style:left="{handle.x}px"
					style:cursor={TRIM_CURSOR}
					aria-label={handle.label}
					title={handle.label}
					disabled={analyzing || !data}
					onpointerdown={(event) => onSelectionHandlePointerDown(event, handle.edge)}
					onpointermove={onSelectionHandlePointerMove}
					onpointerup={onSelectionHandlePointerUp}
					onpointercancel={onSelectionHandlePointerUp}
				>
					<span class="selection-grip-tab" aria-hidden="true"></span>
				</button>
			{/each}

			{#each visibleTrimHandles as handle (handle.key)}
				<button
					type="button"
					class={['trim-grip', handle.edge === 'start' ? 'edge-start' : 'edge-end']}
					class:active={trimDrag?.rangeIndex === handle.rangeIndex &&
						trimDrag?.edge === handle.edge}
					style:left="{handle.x}px"
					style:cursor={TRIM_CURSOR}
					aria-label={handle.label}
					title={handle.label}
					disabled={analyzing || !data}
					onpointerdown={(event) =>
						onTrimHandlePointerDown(event, handle.rangeIndex, handle.edge)}
					onpointermove={onTrimHandlePointerMove}
					onpointerup={onTrimHandlePointerUp}
					onpointercancel={onTrimHandlePointerUp}
				>
					<span class="trim-grip-tab" aria-hidden="true"></span>
				</button>
			{/each}
		</div>
	</div>

	{#if showDockedChrome || showInlineStageChrome}
		{@render stageNavChrome()}
	{:else if showPanelNav}
		{@render navigator()}
	{/if}

	{#if !isStage}
		<p class="hint">
			Pinch or Ctrl/⌘-scroll to zoom · scroll the overview to zoom · two-finger or Shift-drag to pan · drag overview to navigate
			{#if wantsDetail && !detailPcm && ensureDetailPcm}
				· loading detail…
			{/if}
		</p>
	{/if}
	{#if error && onRetry}
		<button type="button" class="zoom-btn label retry" onclick={() => onRetry()}
			>Retry analysis</button
		>
	{/if}
</div>

<style>
	.waveform-overview {
		display: grid;
		gap: var(--space-3);
	}

	.waveform-overview.chrome-stage {
		height: 100%;
		min-height: 0;
		gap: var(--space-2);
		grid-template-rows: auto minmax(0, 1fr);
	}

	.waveform-overview.chrome-stage:not(:has(.status-compact)) {
		grid-template-rows: minmax(0, 1fr);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.status {
		margin: 0;
		font-size: var(--text-meta);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.status-compact {
		padding: 0 var(--space-1);
	}

	.zoom-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.zoom-compact {
		justify-content: flex-start;
		gap: var(--space-1);
		padding: 0;
	}

	.stage-chrome-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-width: 0;
	}

	.chrome-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-1);
		min-width: 0;
	}

	.chrome-actions :global(.chrome-action) {
		box-sizing: border-box;
		min-width: 30px;
		min-height: 30px;
		padding: 0 var(--space-2);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--ink);
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		text-transform: uppercase;
		cursor: pointer;
	}

	.chrome-actions :global(.chrome-action:hover:not(:disabled)) {
		background: var(--surface-subtle);
	}

	.chrome-actions :global(.chrome-action:disabled) {
		border-color: var(--disabled);
		color: var(--disabled);
		cursor: not-allowed;
	}

	.zoom-btn {
		box-sizing: border-box;
		min-width: 30px;
		min-height: 30px;
		padding: 0 var(--space-1);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		cursor: pointer;
	}

	.chrome-stage .zoom-btn {
		background: transparent;
	}

	.zoom-btn.label {
		padding: 0 var(--space-2);
		text-transform: uppercase;
	}

	.zoom-btn:hover:not(:disabled) {
		background: var(--surface-subtle);
	}

	.zoom-btn:disabled {
		border-color: var(--disabled);
		color: var(--disabled);
		cursor: not-allowed;
	}

	.retry {
		justify-self: start;
	}

	.stage-nav-chrome {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	/* Keep dock-bound chrome out of the stage grid until/while portaled. */
	.waveform-overview > .stage-nav-chrome.dock-target {
		display: none;
	}

	.wave-stage {
		/* Room for overhanging trim / selection grip tabs below the wave frame.
		   Fade grips sit inside the frame at the top — no top padding.
		   Do not set overflow-x here — mixed overflow axes compute y to clip too. */
		padding-bottom: calc(var(--space-3) + var(--space-2));
	}

	.chrome-stage .wave-stage {
		box-sizing: border-box;
		min-height: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.wave-frame-host {
		position: relative;
	}

	.chrome-stage .wave-frame-host {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.wave-frame {
		width: 100%;
		height: calc((var(--space-7) + var(--space-5)) * 4);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
		overflow: hidden;
		touch-action: none;
	}

	.fade-grip,
	.selection-grip,
	.trim-grip {
		box-sizing: border-box;
		position: absolute;
		z-index: 2;
		display: flex;
		width: var(--touch-min);
		height: var(--touch-min);
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
	}

	/* Fade tabs sit on the bottom edge of the time ruler (in the bottom pad). */
	.fade-grip {
		top: calc(var(--wave-ruler-h, 36px) - var(--touch-min));
		flex-direction: column;
		justify-content: flex-end;
	}

	.selection-grip,
	.trim-grip {
		top: 100%;
		flex-direction: column;
		justify-content: flex-start;
	}

	/* Below fade; below trim so trim/fade win overlapping hits. */
	.selection-grip {
		z-index: 1;
	}

	.fade-grip.edge-in,
	.selection-grip.edge-start,
	.trim-grip.edge-start {
		align-items: flex-start;
		transform: translate(0, 0);
	}

	.fade-grip.edge-out,
	.selection-grip.edge-end,
	.trim-grip.edge-end {
		align-items: flex-end;
		transform: translate(-100%, 0);
	}

	.fade-grip:disabled,
	.selection-grip:disabled,
	.trim-grip:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.fade-grip:focus-visible,
	.selection-grip:focus-visible,
	.trim-grip:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* Selection: ink block tabs (distinct from signal trim). */
	.selection-grip-tab {
		display: block;
		width: var(--space-4);
		height: var(--space-3);
		flex-shrink: 0;
		background: var(--ink);
	}

	.selection-grip.edge-start .selection-grip-tab {
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
	}

	.selection-grip.edge-end .selection-grip-tab {
		border-radius: var(--radius-control) 0 0 var(--radius-control);
	}

	.selection-grip.active .selection-grip-tab {
		background: var(--line-strong);
	}

	/* Trim: signal block tabs (rectangle). */
	.trim-grip-tab {
		display: block;
		width: var(--space-4);
		height: var(--space-3);
		flex-shrink: 0;
		background: var(--signal);
	}

	.trim-grip.edge-start .trim-grip-tab {
		border-radius: 0 var(--radius-control) var(--radius-control) 0;
	}

	.trim-grip.edge-end .trim-grip-tab {
		border-radius: var(--radius-control) 0 0 var(--radius-control);
	}

	.trim-grip.active .trim-grip-tab {
		background: var(--ink);
	}

	/* Fade: ink wedge tabs (ramp triangles), distinct from trim blocks. */
	.fade-grip-tab {
		display: block;
		width: var(--space-4);
		height: var(--space-3);
		flex-shrink: 0;
		background: var(--ink);
		border-radius: 0;
	}

	/* Fade-in: rises into the grip (full-gain edge on the left). */
	.fade-grip.edge-in .fade-grip-tab {
		clip-path: polygon(0 0, 100% 0, 0 100%);
	}

	/* Fade-out: falls from the grip (full-gain edge on the right). */
	.fade-grip.edge-out .fade-grip-tab {
		clip-path: polygon(0 0, 100% 0, 100% 100%);
	}

	.fade-grip.active .fade-grip-tab {
		background: var(--line-strong);
	}

	.nav-frame {
		width: 100%;
		height: calc(var(--space-7) + var(--space-2));
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface-subtle);
		overflow: hidden;
		touch-action: none;
	}

	.chrome-stage .wave-frame {
		flex: 1 1 auto;
		height: auto;
		min-height: calc((var(--space-7) + var(--space-5)) * 3);
		border: none;
		border-radius: 0;
		border-bottom: 1px solid var(--line);
		background: transparent;
	}

	.chrome-stage .nav-frame {
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: transparent;
	}

	.wave-frame.analyzing,
	.nav-frame.analyzing {
		border-style: dashed;
	}

	.chrome-stage .wave-frame.analyzing {
		border-style: none none dashed none;
	}

	.chrome-stage .nav-frame.analyzing {
		border-style: dashed;
	}

	.hint {
		margin: 0;
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}

	.nav-frame canvas {
		cursor: inherit;
	}

	.wave-frame canvas {
		cursor: inherit;
	}
</style>
