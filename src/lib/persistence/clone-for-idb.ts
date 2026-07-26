/**
 * Produce a structured-cloneable plain object for IndexedDB writes.
 * Svelte 5 `$state` proxies (and similar) are not DataClone-compatible;
 * JSON round-trip reads through the proxy into plain POJOs.
 */
export function cloneForIdb<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
