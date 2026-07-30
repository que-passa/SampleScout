/**
 * Rasterize brand assets from src/lib/assets/logo-mark.svg (source of truth).
 * Requires @resvg/resvg-js. Run: npm run generate:brand-assets
 *
 * Important: logo-mark uses stroke-only paths with root fill="none".
 * Never drop fill="none" when embedding — SVG default fill is black and will
 * close/fill open stroke paths (corner brackets become triangles, etc.).
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = path.join(root, 'static');
const logoPath = path.join(root, 'src/lib/assets/logo-mark.svg');
const geistMono = path.join(
	root,
	'node_modules/@fontsource/geist-mono/files/geist-mono-latin-600-normal.woff'
);
const geistMonoRegular = path.join(
	root,
	'node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff'
);

function extractLogoInner(logoSvg) {
	const match = logoSvg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
	if (!match) throw new Error('Could not parse logo-mark.svg');
	return match[1].trim();
}

/** Full-bleed mark: nest logo-mark so its fill="none" is preserved. */
function buildIconAny(logoInner) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 30 30" role="img" aria-label="SampleScout">
	${logoInner}
</svg>
`;
}

/** Maskable: brand backdrop + mark inset to the ~80% safe zone. */
function buildIconMaskable(logoInner) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 512 512" role="img" aria-label="SampleScout">
	<title>SampleScout</title>
	<rect width="512" height="512" fill="#00F0C8" />
	<svg x="51.2" y="51.2" width="409.6" height="409.6" viewBox="0 0 30 30" fill="none">
		${logoInner}
	</svg>
</svg>
`;
}

function buildOg(logoInner) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1200 630" role="img" aria-label="SampleScout">
	<title>SampleScout - Capture sounds on the go.</title>
	<rect width="1200" height="630" fill="#f0f0ec" />
	<svg x="480" y="105" width="240" height="240" viewBox="0 0 30 30" fill="none">
		${logoInner}
	</svg>
	<text
		x="600"
		y="420"
		text-anchor="middle"
		font-family="Geist Mono"
		font-size="56"
		font-weight="600"
		fill="#111111"
		letter-spacing="0.04em"
	>SampleScout</text>
	<text
		x="600"
		y="480"
		text-anchor="middle"
		font-family="Geist Mono"
		font-size="28"
		font-weight="400"
		fill="#5c5c58"
		letter-spacing="0.06em"
	>Capture sounds on the go.</text>
</svg>
`;
}

function rasterize(svg, width, fontFiles = []) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: width },
		font: {
			fontFiles,
			loadSystemFonts: true,
			defaultFontFamily: 'Geist Mono'
		}
	});
	return resvg.render().asPng();
}

const logoSvg = await readFile(logoPath, 'utf8');
const logoInner = extractLogoInner(logoSvg);

const iconAnySvg = buildIconAny(logoInner);
const iconMaskableSvg = buildIconMaskable(logoInner);
const ogSvg = buildOg(logoInner);

await mkdir(path.join(staticDir, 'icons'), { recursive: true });

await writeFile(path.join(staticDir, 'favicon.svg'), iconAnySvg);
await writeFile(path.join(staticDir, 'icons/icon-192.svg'), iconAnySvg);
await writeFile(path.join(staticDir, 'icons/icon-512.svg'), iconAnySvg);
await writeFile(path.join(staticDir, 'icons/icon-maskable-512.svg'), iconMaskableSvg);
await writeFile(path.join(staticDir, 'icons/og-image.svg'), ogSvg);

/** @type {{ svg: string; out: string; width: number; fonts?: boolean }[]} */
const jobs = [
	{ svg: iconAnySvg, out: 'icons/icon-192.png', width: 192 },
	{ svg: iconAnySvg, out: 'icons/icon-512.png', width: 512 },
	{ svg: iconMaskableSvg, out: 'icons/icon-maskable-512.png', width: 512 },
	{ svg: iconAnySvg, out: 'apple-touch-icon.png', width: 180 },
	{ svg: iconAnySvg, out: 'favicon-32.png', width: 32 },
	{ svg: ogSvg, out: 'og-image.png', width: 1200, fonts: true }
];

for (const job of jobs) {
	const fonts = job.fonts ? [geistMono, geistMonoRegular] : [];
	await writeFile(path.join(staticDir, job.out), rasterize(job.svg, job.width, fonts));
	console.log(`wrote ${job.out} (${job.width}px wide)`);
}

for (const name of ['_compare-original.png', '_compare-scaled.png', '_compare-explicit.png']) {
	await unlink(path.join(staticDir, 'icons', name)).catch(() => {});
}
