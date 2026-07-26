<script lang="ts">
	import logoMark from '$lib/assets/logo-mark.svg';
	import { APP_NAME } from '$lib/config/recording';
	import { audiotoolAuth, connect } from '$lib/state/audiotool-auth.svelte';

	const status = $derived(audiotoolAuth.status);
	const ready = $derived(audiotoolAuth.ready);
	const busy = $derived(audiotoolAuth.busy);

	const buttonDisabled = $derived(
		!ready || busy || !status.configured || status.state === 'connecting'
	);

	const buttonLabel = $derived.by(() => {
		if (!ready) return 'Checking connection…';
		if (busy || status.state === 'connecting') return 'Connecting…';
		return 'Connect Audiotool';
	});
</script>

<div class="splash">
	<div class="composition">
		<img class="logo" src={logoMark} alt="" width="72" height="72" />
		<h1 class="brand">{APP_NAME}</h1>
		<p class="support">Connect Audiotool to Capture and manage your device-only Collection.</p>

		{#if !status.configured}
			<p class="hint" role="status">
				{status.message}
			</p>
		{:else if status.state === 'error'}
			<p class="error" role="alert">{status.message}</p>
		{:else if !ready}
			<p class="hint" role="status">Checking connection…</p>
		{:else if busy || status.state === 'connecting'}
			<p class="hint" role="status">{status.message || 'Working…'}</p>
		{/if}

		<button type="button" class="action" onclick={() => void connect()} disabled={buttonDisabled}>
			{buttonLabel}
		</button>
	</div>
</div>

<style>
	.splash {
		height: 100%;
		min-height: 0;
		overflow: auto;
		display: grid;
		place-items: center;
		padding: var(--space-5) var(--space-4);
		background: var(--paper);
	}

	.composition {
		display: grid;
		justify-items: center;
		gap: var(--space-4);
		width: min(100%, 22rem);
		text-align: center;
	}

	.logo {
		width: calc(var(--space-7) + var(--space-5));
		height: calc(var(--space-7) + var(--space-5));
		display: block;
	}

	.brand {
		margin: 0;
		font-size: var(--text-title);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ink);
	}

	.support {
		margin: 0;
		color: var(--ink-muted);
		font-size: var(--text-body);
		max-width: 20rem;
	}

	.hint {
		margin: 0;
		color: var(--ink-muted);
		font-size: var(--text-meta);
		max-width: 20rem;
	}

	.error {
		margin: 0;
		color: var(--signal);
		font-size: var(--text-meta);
		max-width: 20rem;
	}

	.action {
		margin-top: var(--space-2);
		min-height: var(--touch-min);
		padding: 0 var(--space-5);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--ink);
		color: var(--surface);
		font-size: var(--text-button);
		font-weight: 600;
		cursor: pointer;
	}

	.action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>
