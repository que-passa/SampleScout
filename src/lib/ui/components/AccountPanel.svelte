<script lang="ts">
	import { resolve } from '$app/paths';
	import { deleteAllLocalData } from '$lib/persistence';
	import { installGuideKind, installPrompt, openInstallFlow } from '$lib/pwa';
	import { actionToast, audiotoolAuth, captureController, connect, disconnect } from '$lib/state';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';

	let clearing = $state(false);
	let confirmOpen = $state(false);
	let installBusy = $state(false);

	async function handleConnect() {
		await connect();
	}

	async function handleDisconnect() {
		await disconnect();
	}

	function requestDeleteAll() {
		if (clearing) return;
		confirmOpen = true;
	}

	function cancelDeleteAll() {
		if (clearing) return;
		confirmOpen = false;
	}

	async function confirmDeleteAll() {
		if (clearing) return;
		clearing = true;
		try {
			await deleteAllLocalData();
			await captureController.reset();
			actionToast.show('Local data cleared');
			confirmOpen = false;
		} catch {
			actionToast.show('Could not clear all local data');
			confirmOpen = false;
		} finally {
			clearing = false;
		}
	}

	async function handleInstall() {
		if (installBusy) return;
		installBusy = true;
		try {
			await openInstallFlow();
		} finally {
			installBusy = false;
		}
	}

	const auth = $derived(audiotoolAuth.status);
	const authBusy = $derived(audiotoolAuth.busy);
	const identityLabel = $derived(auth.displayName || auth.userName);
	const authTone = $derived(auth.state === 'connected' ? 'brand' : 'signal');
	const installGuide = $derived(
		installGuideKind({
			standalone: installPrompt.standalone,
			dismissed: installPrompt.dismissed,
			ios: installPrompt.ios,
			canNativePrompt: installPrompt.canNativePrompt
		})
	);
</script>

<section class="block">
	<div class="panel">
		<div class="row">
			<h2>Audiotool</h2>
			<StatusLabel tone={authTone}>
				{auth.state}
			</StatusLabel>
		</div>
		{#if auth.state === 'connected'}
			{#if identityLabel}
				<p class="body"><strong>{identityLabel}</strong></p>
			{:else}
				<p class="body">Connected</p>
			{/if}
		{:else if auth.message}
			<p class="body">{auth.message}</p>
		{/if}
		{#if auth.error}
			<p class="error">{auth.error.message}</p>
		{/if}
	</div>
	<!-- Ghost/Primary sit on sheet paper — not on --surface — so hover/press faces read. -->
	<div class="actions">
		{#if auth.state === 'connected'}
			<GhostButton disabled={authBusy} onclick={handleDisconnect}>
				{authBusy ? 'Working…' : 'Disconnect'}
			</GhostButton>
		{:else}
			<PrimaryButton disabled={!auth.configured || authBusy} onclick={handleConnect}>
				{authBusy ? 'Working…' : 'Connect Audiotool'}
			</PrimaryButton>
		{/if}
	</div>
</section>

{#if installGuide !== 'none'}
	<section class="block">
		<div class="panel">
			<h2>Home screen</h2>
			<p class="body">
				{#if installGuide === 'ios'}
					Add SampleScout from Share for one-tap Capture. Safari has no install button.
				{:else}
					Install SampleScout for one-tap Capture from your home screen.
				{/if}
			</p>
		</div>
		<div class="actions">
			{#if installGuide === 'native'}
				<PrimaryButton disabled={installBusy} onclick={() => void handleInstall()}>
					{installBusy ? 'Working…' : 'Install app'}
				</PrimaryButton>
			{:else}
				<GhostButton disabled={installBusy} onclick={() => void handleInstall()}>
					How to install
				</GhostButton>
			{/if}
		</div>
	</section>
{/if}

<section class="block">
	<div class="panel">
		<h2>Local data</h2>
		<p class="body">
			Not uploaded. Only on this device. Clearing browser data removes Local Files.
		</p>
	</div>
	<div class="actions">
		<GhostButton danger disabled={clearing} onclick={requestDeleteAll}>
			{clearing ? 'Clearing…' : 'Delete all'}
		</GhostButton>
	</div>
</section>

<p class="debug-link">
	<a href={resolve('/debug')}>Diagnostics</a>
</p>

{#if confirmOpen}
	<ConfirmDialog
		title="Delete all"
		message="Delete all local data? Cannot be undone."
		confirmLabel="Delete"
		busy={clearing}
		oncancel={cancelDeleteAll}
		onconfirm={() => void confirmDeleteAll()}
	/>
{/if}

<style>
	.block {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.actions {
		display: grid;
		gap: var(--space-3);
		justify-items: end;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.body {
		color: var(--ink-muted);
		max-width: 40rem;
	}

	.error {
		color: var(--signal);
	}

	.debug-link {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.debug-link a {
		color: var(--ink-muted);
		text-decoration: underline;
		text-underline-offset: var(--space-1);
	}

	.debug-link a:hover {
		color: var(--ink);
	}
</style>
