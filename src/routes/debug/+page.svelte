<script lang="ts">
	import { onMount } from 'svelte';
	import { detectCapabilities, formatBytes } from '$lib/capabilities';
	import type { CapabilityReport } from '$lib/capabilities';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';

	let capabilities = $state<CapabilityReport | null>(null);

	onMount(() => {
		void detectCapabilities().then((report) => {
			capabilities = report;
		});
	});

	const capabilityRows = $derived(
		capabilities
			? [
					['Secure context', capabilities.secureContext],
					['getUserMedia', capabilities.getUserMedia],
					['MediaRecorder', capabilities.mediaRecorder],
					['Web Audio', capabilities.webAudio],
					['OPFS', capabilities.opfs],
					['IndexedDB', capabilities.indexedDb],
					['Workers', capabilities.workers],
					['Canvas', capabilities.canvas],
					['Can record', capabilities.canRecord],
					['Can save Local Drafts', capabilities.canPersistDrafts]
				]
			: []
	);
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
				Storage available: {formatBytes(capabilities.storageEstimate.availableBytes)}
			</p>
			<table>
				<tbody>
					{#each capabilityRows as [label, value] (label)}
						<tr>
							<th>{label}</th>
							<td>{value ? 'yes' : 'no'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
