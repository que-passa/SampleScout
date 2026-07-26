/// <reference types="@sveltejs/kit" />
import { build, files, version, base } from '$service-worker';

const CACHE = `samplescout-shell-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Never cache Audiotool API traffic or non-GET requests.
	if (event.request.method !== 'GET') return;
	if (url.hostname.includes('audiotool.com')) return;

	// Only handle same-origin app shell under the deployment base path.
	if (url.origin !== self.location.origin) return;
	if (base && !url.pathname.startsWith(base)) return;

	event.respondWith(
		caches.open(CACHE).then(async (cache) => {
			const cached = await cache.match(event.request);
			if (cached) return cached;

			try {
				const response = await fetch(event.request);
				if (response.ok && ASSETS.includes(url.pathname)) {
					void cache.put(event.request, response.clone());
				}
				return response;
			} catch {
				const fallback = await cache.match(`${base || ''}/`);
				if (fallback) return fallback;
				throw new Error('Offline and no cached shell available.');
			}
		})
	);
});
