<script lang="ts">
	import { onMount } from 'svelte';
	import { detectCapabilities, explainCaptureLimitations, formatBytes } from '$lib/capabilities';
	import type { CapabilityReport } from '$lib/capabilities';
	import { getPublicAppConfig } from '$lib/config/app';
	import { captureSentryTestError, isClientSentryActive } from '$lib/monitoring/sentry-client';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';

	const sentry = getPublicAppConfig().sentry;
	const sentryConfigured = sentry.configured;
	const sentryActive = isClientSentryActive();

	let capabilities = $state<CapabilityReport | null>(null);

	onMount(() => {
		void detectCapabilities().then((report) => {
			capabilities = report;
		});
	});

	function storageOkLabel(value: boolean | null): string {
		if (value === null) return 'unknown';
		return value ? 'yes' : 'no';
	}

	const capabilityRows = $derived(
		capabilities
			? [
					['Secure context', capabilities.secureContext ? 'yes' : 'no'],
					['getUserMedia', capabilities.getUserMedia ? 'yes' : 'no'],
					['MediaRecorder', capabilities.mediaRecorder ? 'yes' : 'no'],
					['Web Audio', capabilities.webAudio ? 'yes' : 'no'],
					['OPFS (writable)', capabilities.opfs ? 'yes' : 'no'],
					['IndexedDB', capabilities.indexedDb ? 'yes' : 'no'],
					['Workers', capabilities.workers ? 'yes' : 'no'],
					['Canvas', capabilities.canvas ? 'yes' : 'no'],
					['Can record', capabilities.canRecord ? 'yes' : 'no'],
					['Can save Local Files', capabilities.canPersistFiles ? 'yes' : 'no'],
					['Storage estimate', capabilities.storageEstimate.supported ? 'yes' : 'no'],
					['Storage OK for max Capture', storageOkLabel(capabilities.storageOkForMaxRecording)],
					['Can Capture safely', capabilities.canCaptureSafely ? 'yes' : 'no']
				]
			: []
	);

	const limitations = $derived(capabilities ? explainCaptureLimitations(capabilities) : []);
</script>

<svelte:head>
	<title>Debug · SampleScout</title>
</svelte:head>

<AppShell>
	<p class="intro">Internal diagnostics for capture capability. Not required for normal use.</p>

	<section class="panel">
		<h2>Capability report</h2>
		{#if !capabilities}
			<p class="body">Probing browser capabilities…</p>
		{:else}
			<p class="body">
				Storage available: {formatBytes(capabilities.storageEstimate.availableBytes)} · need ~
				{formatBytes(capabilities.storageRequiredForMaxRecording)} for a max-length Capture
			</p>
			{#if !capabilities.storageEstimate.supported}
				<p class="body">
					Quota estimate unsupported — Capture may still run; save fails honestly if the write
					cannot complete.
				</p>
			{/if}
			<table>
				<tbody>
					{#each capabilityRows as [label, value] (label)}
						<tr>
							<th>{label}</th>
							<td>{value}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if limitations.length}
				<p class="label">Limitations</p>
				<ul>
					{#each limitations as reason (reason)}
						<li>{reason}</li>
					{/each}
				</ul>
			{/if}
			{#if capabilities.mediaRecorderMimes.length}
				<p class="label">MediaRecorder MIME</p>
				<ul>
					{#each capabilities.mediaRecorderMimes as mime (mime.mimeType)}
						<li>
							{mime.mimeType}
							— {mime.supported ? 'supported' : 'unsupported'}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<section class="panel">
		<h2>Sentry</h2>
		{#if sentryActive}
			<p class="body">
				Error monitoring is enabled for this build. Use the button below to send a test error to
				Sentry.
			</p>
			<GhostButton danger onclick={() => captureSentryTestError()}>Throw test error</GhostButton>
		{:else if sentryConfigured}
			<p class="body">
				<code>PUBLIC_SENTRY_DSN</code> is set, but client reporting is off in local
				<code>npm run dev</code> (avoids HMR noise). Production / preview builds still report. Set
				<code>PUBLIC_SENTRY_ENABLE_IN_DEV=true</code> to opt in for localhost testing.
			</p>
		{:else}
			<p class="body">
				Set <code>PUBLIC_SENTRY_DSN</code> in <code>.env</code> to enable client-side error monitoring.
			</p>
		{/if}
	</section>
</AppShell>

<style>
	.intro {
		margin: 0 0 var(--space-5);
		max-width: 40rem;
		color: var(--ink-muted);
		font-size: var(--text-meta);
	}

	.panel {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
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

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-meta);
	}

	th,
	td {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--line);
		text-align: left;
		font-weight: 400;
	}

	th {
		color: var(--ink-muted);
		width: 60%;
	}

	.label {
		margin-top: var(--space-2);
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	ul {
		margin: 0;
		padding-left: var(--space-4);
		color: var(--ink-muted);
		font-size: var(--text-meta);
	}
</style>
