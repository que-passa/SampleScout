import { MIN_VIEW_SPAN, type ViewWindow } from './view-window';

/** Horizontal edge zone (CSS px) that triggers auto-pan while dragging grips. */
export const EDGE_SCROLL_ZONE_PX = 40;

/**
 * Max auto-pan rate as a fraction of the visible span per second at full intensity.
 * Tempo scales with zoom: deeper zoom → smaller absolute-time delta, steady visual speed.
 */
export const EDGE_SCROLL_SPAN_PER_SEC = 0.9;

/**
 * Signed intensity in [-1, 1]: negative pans earlier (left), positive later (right).
 * 0 outside the edge zone.
 */
export function edgeScrollIntensity(
	localX: number,
	width: number,
	zonePx = EDGE_SCROLL_ZONE_PX
): number {
	if (!(width > 0) || !(zonePx > 0)) return 0;
	const zone = Math.min(zonePx, width / 2);
	if (localX <= zone) {
		return -Math.max(0, Math.min(1, (zone - localX) / zone));
	}
	if (localX >= width - zone) {
		return Math.max(0, Math.min(1, (localX - (width - zone)) / zone));
	}
	return 0;
}

/**
 * Absolute view delta for one frame. Positive reveals later time.
 * Scales with `view` span so scroll tempo tracks zoom level.
 */
export function edgeScrollDeltaAbs(
	view: ViewWindow,
	intensity: number,
	dtSeconds: number,
	spanPerSec = EDGE_SCROLL_SPAN_PER_SEC
): number {
	if (!(Math.abs(intensity) > 0) || !(dtSeconds > 0) || !(spanPerSec > 0)) return 0;
	const span = Math.max(MIN_VIEW_SPAN, view.end - view.start);
	return intensity * span * spanPerSec * dtSeconds;
}

/** Whether the view can still pan in the intensity direction. */
export function edgeScrollCanPan(view: ViewWindow, intensity: number): boolean {
	if (intensity < 0) return view.start > 1e-9;
	if (intensity > 0) return view.end < 1 - 1e-9;
	return false;
}
