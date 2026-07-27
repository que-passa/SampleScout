<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { APP_NAME } from '$lib/config/recording';
	import { closeAccountOverlay } from '$lib/state/account-overlay';
	import AccountButton from '$lib/ui/components/AccountButton.svelte';
	import AccountOverlay from '$lib/ui/components/AccountOverlay.svelte';
	import AccountPanel from '$lib/ui/components/AccountPanel.svelte';
	import BackButton from '$lib/ui/components/BackButton.svelte';

	let { children }: { children?: Snippet } = $props();

	const captureChrome = $derived(page.route.id === '/capture' || page.route.id === '/');
	const collectionChrome = $derived(page.route.id === '/drafts');
	const debugChrome = $derived(page.route.id === '/debug');
	const editorChrome = $derived(page.route.id === '/take/[takeId]');
	const accountRoute = $derived(page.route.id === '/account');
	const instrumentChrome = $derived(captureChrome || editorChrome);
	const pinnedPageChrome = $derived(instrumentChrome || collectionChrome);
	const showTopBar = $derived(captureChrome || collectionChrome || debugChrome);
	const accountOpen = $derived(Boolean(page.state.accountOpen) || accountRoute);

	const pageTitle = $derived(collectionChrome ? 'Collection' : debugChrome ? 'Debug' : undefined);
</script>

<div class={['shell', editorChrome && 'editor-chrome', pinnedPageChrome && 'instrument-chrome']}>
	{#if showTopBar}
		<header class="top-bar">
			<div class="top-bar-start">
				{#if captureChrome}
					<a class="brand" href={resolve('/capture')}>
						<img class="brand-mark" src={logoMark} alt="" width="28" height="28" />
						<span>{APP_NAME}</span>
					</a>
				{:else}
					<BackButton href={resolve('/capture')} label="Capture" />
				{/if}
			</div>
			<div class="top-bar-title">
				{#if pageTitle}
					<h1 class="page-title">{pageTitle}</h1>
				{/if}
			</div>
			<div class="top-bar-end">
				<AccountButton expanded={accountOpen} />
			</div>
		</header>
	{/if}

	<div class="body">
		<main
			class={[
				'main',
				instrumentChrome && 'instrument-main',
				collectionChrome && 'collection-main',
				accountRoute && 'account-host'
			]}
		>
			{#if children}
				{@render children()}
			{/if}
		</main>
	</div>

	{#if accountOpen}
		<AccountOverlay onclose={closeAccountOverlay}>
			<AccountPanel />
		</AccountOverlay>
	{/if}
</div>

<style>
	.shell {
		height: 100%;
		overflow: hidden;
		display: grid;
		grid-template-rows: auto 1fr;
	}

	.shell.editor-chrome {
		grid-template-rows: 1fr;
	}

	.top-bar {
		display: grid;
		grid-template-columns: minmax(var(--touch-min), 1fr) minmax(0, 2.5fr) minmax(
				var(--touch-min),
				1fr
			);
		align-items: center;
		column-gap: var(--space-2);
		min-height: var(--touch-min);
		padding: var(--space-2);
		background: var(--paper);
	}

	.top-bar-start {
		justify-self: start;
		min-width: 0;
	}

	.top-bar-title {
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.top-bar-end {
		justify-self: end;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--text-title);
		font-weight: 600;
		letter-spacing: 0.02em;
		text-decoration: none;
		color: var(--ink);
	}

	.brand-mark {
		width: calc(var(--space-5) + var(--space-1));
		height: calc(var(--space-5) + var(--space-1));
		display: block;
		flex-shrink: 0;
	}

	.page-title {
		margin: 0;
		font-size: var(--text-title);
		font-weight: 600;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.body {
		display: grid;
		min-height: 0;
		min-width: 0;
	}

	.main {
		padding: var(--space-4);
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}

	.main.instrument-main,
	.main.collection-main {
		padding: 0;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.main.account-host {
		padding: 0;
	}

	@media (min-width: 900px) {
		.main {
			padding: var(--space-5);
		}

		.main.instrument-main,
		.main.collection-main,
		.main.account-host {
			padding: 0;
		}
	}
</style>
