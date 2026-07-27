<script lang="ts">
	import logoMark from '$lib/assets/logo-mark.svg';
	import { APP_NAME, APP_TAGLINE } from '$lib/config/recording';
	import { audiotoolAuth, connect } from '$lib/state/audiotool-auth.svelte';
	import BusyIndicator from '$lib/ui/components/BusyIndicator.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';

	const status = $derived(audiotoolAuth.status);
	const ready = $derived(audiotoolAuth.ready);
	const busy = $derived(audiotoolAuth.busy);

	const pending = $derived(!ready || busy || status.state === 'connecting');

	const buttonDisabled = $derived(pending || !status.configured);

	const statusMessage = $derived.by(() => {
		if (!status.configured) return 'OAuth not configured.';
		if (status.state === 'error') {
			return status.message || 'Connection failed.';
		}
		return '';
	});
</script>

<div class="splash">
	<div class="composition">
		<div class="brand-lockup">
			<img class="logo" src={logoMark} alt="" width="60" height="60" />
			<h1 class="brand">{APP_NAME}</h1>
		</div>
		<p class="support">{APP_TAGLINE}</p>

		<div class="status-slot" aria-live="polite">
			{#if statusMessage}
				<p
					class="status-text"
					class:error={status.state === 'error'}
					role={status.state === 'error' ? 'alert' : 'status'}
				>
					{statusMessage}
				</p>
			{:else if pending}
				<BusyIndicator label="Connecting" />
			{/if}
		</div>

		<PrimaryButton class="connect" disabled={buttonDisabled} onclick={() => void connect()}>
			Connect Audiotool
		</PrimaryButton>
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

	.brand-lockup {
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		/* Sit logo + name a bit above the centered composition. */
		transform: translateY(calc(-1 * var(--space-7)));
	}

	.logo {
		width: calc(var(--space-7) + var(--space-3));
		height: calc(var(--space-7) + var(--space-3));
		display: block;
	}

	.brand {
		margin: 0;
		font-size: var(--text-screen);
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

	.status-slot {
		display: grid;
		place-items: center;
		min-height: calc(var(--text-meta) * 1.4);
		width: 100%;
	}

	.status-text {
		margin: 0;
		color: var(--ink-muted);
		font-size: var(--text-meta);
		max-width: 20rem;
	}

	.status-text.error {
		color: var(--signal);
	}

	.composition :global(.connect) {
		margin-top: var(--space-2);
		min-width: 14.5rem;
	}
</style>
