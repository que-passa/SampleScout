<script lang="ts">
	import { resolve } from '$app/paths';
	import { deleteAllLocalData } from '$lib/persistence';
	import { audiotoolAuth, captureController, connect, disconnect } from '$lib/state';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';

	let clearing = $state(false);
	let clearMessage = $state('');
	let confirmOpen = $state(false);

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
		clearMessage = '';
		try {
			await deleteAllLocalData();
			await captureController.reset();
			clearMessage = 'Local metadata cleared. Binary storage cleared when OPFS is available.';
			confirmOpen = false;
		} catch {
			clearMessage = 'Could not clear all local data.';
			confirmOpen = false;
		} finally {
			clearing = false;
		}
	}

	const auth = $derived(audiotoolAuth.status);
	const authBusy = $derived(audiotoolAuth.busy);
	const identityLabel = $derived(auth.displayName || auth.userName);
	const authTone = $derived(
		auth.state === 'connected' ? 'ok' : auth.state === 'error' ? 'signal' : 'muted'
	);
</script>

<section class="panel">
	<div class="row">
		<h2>Audiotool</h2>
		<StatusLabel tone={authTone}>
			{auth.state}
		</StatusLabel>
	</div>
	<p class="body">{auth.message}</p>
	{#if identityLabel}
		<p class="body">Signed in as <strong>{identityLabel}</strong>.</p>
	{/if}
	{#if auth.error}
		<p class="error">{auth.error.message}</p>
	{/if}
	{#if auth.state === 'connected'}
		<button type="button" class="action" onclick={handleDisconnect} disabled={authBusy}>
			{authBusy ? 'Working…' : 'Disconnect'}
		</button>
	{:else}
		<button
			type="button"
			class="action"
			onclick={handleConnect}
			disabled={!auth.configured || authBusy}
		>
			{authBusy ? 'Working…' : 'Connect Audiotool'}
		</button>
	{/if}
</section>

<section class="panel">
	<h2>Local data</h2>
	<p class="body">
		The Collection contains Local Drafts saved on this device only. There is no cloud backup and no
		cross-device sync. Clearing site data in the browser also removes them.
	</p>
	<button type="button" class="danger" onclick={requestDeleteAll} disabled={clearing}>
		{clearing ? 'Clearing…' : 'Delete all local data'}
	</button>
	{#if clearMessage}
		<p class="body">{clearMessage}</p>
	{/if}
</section>

<p class="debug-link">
	<a href={resolve('/debug')}>Developer diagnostics</a>
</p>

{#if confirmOpen}
	<ConfirmDialog
		title="Delete all"
		message="Delete all local SampleScout data on this device? This cannot be undone."
		confirmLabel="Delete all"
		busy={clearing}
		oncancel={cancelDeleteAll}
		onconfirm={() => void confirmDeleteAll()}
	/>
{/if}

<style>
	.panel {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
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

	.action,
	.danger {
		justify-self: start;
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--ink);
		color: var(--surface);
		font-size: var(--text-button);
		font-weight: 600;
	}

	.action:disabled,
	.danger:disabled {
		opacity: 0.5;
	}

	.danger {
		background: var(--surface);
		color: var(--signal);
		border-color: var(--signal);
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
