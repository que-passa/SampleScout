<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { handlePageTransition } from '$lib/navigation/page-transitions';
	import '$lib/styles/app.css';
	import { audiotoolAuth, hydrateAudiotoolAuth } from '$lib/state/audiotool-auth.svelte';
	import { hydrateUploadQueue, uploadQueue } from '$lib/state/upload-queue.svelte';
	import ActionToast from '$lib/ui/components/ActionToast.svelte';
	import AuthSplash from '$lib/ui/components/AuthSplash.svelte';

	let { children } = $props();

	const connected = $derived(audiotoolAuth.ready && audiotoolAuth.status.state === 'connected');

	onNavigate(handlePageTransition);

	onMount(() => {
		void hydrateAudiotoolAuth();
	});

	$effect(() => {
		if (connected && !uploadQueue.hydrated) {
			void hydrateUploadQueue();
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={logoMark} />
	<title>SampleScout</title>
</svelte:head>

{#if connected}
	{@render children()}
	<div class="toast-host">
		<ActionToast />
	</div>
{:else}
	<AuthSplash />
{/if}

<style>
	.toast-host {
		position: fixed;
		inset: 0;
		/* Above SheetOverlay (50) and ConfirmDialog (60) so outcomes stay visible over sheets. */
		z-index: 70;
		/* Single grid cell so any concurrent intro/outro toasts occupy the same spot. */
		display: grid;
		place-items: center;
		padding-inline: var(--space-5);
		pointer-events: none;
		overflow: visible;
	}

	.toast-host :global(.toast) {
		grid-area: 1 / 1;
		pointer-events: auto;
	}
</style>
