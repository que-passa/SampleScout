<script lang="ts">
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import { closeInstallSheet, dismissInstallOffer } from '$lib/pwa';

	let {
		open = false
	}: {
		open?: boolean;
	} = $props();

	function onGotIt() {
		closeInstallSheet();
	}

	function onNotNow() {
		dismissInstallOffer();
	}
</script>

{#if open}
	<SheetOverlay title="Add to Home Screen" elevated onclose={closeInstallSheet}>
		{#snippet footer()}
			<GhostButton onclick={onNotNow}>Not now</GhostButton>
			<PrimaryButton onclick={onGotIt}>Got it</PrimaryButton>
		{/snippet}
		<div class="sheet">
			<p class="lead">
				Safari does not offer a one-tap install. Add SampleScout from Share so Capture is one tap
				away.
			</p>

			<ol class="steps">
				<li>
					<span class="step-num" aria-hidden="true">1</span>
					<span class="step-body">
						<strong>Tap Share</strong>
						<span class="hint">Bottom center on iPhone; top right on iPad.</span>
					</span>
				</li>
				<li>
					<span class="step-num" aria-hidden="true">2</span>
					<span class="step-body">
						<strong>Add to Home Screen</strong>
						<span class="hint">Scroll the share sheet if you do not see it.</span>
					</span>
				</li>
				<li>
					<span class="step-num" aria-hidden="true">3</span>
					<span class="step-body">
						<strong>Tap Add</strong>
						<span class="hint">SampleScout appears on your Home Screen like an app.</span>
					</span>
				</li>
			</ol>
		</div>
	</SheetOverlay>
{/if}

<style>
	.sheet {
		display: grid;
		gap: var(--space-5);
	}

	.lead {
		margin: 0;
		color: var(--ink-muted);
		max-width: 40rem;
	}

	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--space-3);
	}

	.steps li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: start;
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.step-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		height: var(--touch-min);
		border-radius: var(--radius-round);
		border: 1px solid var(--line-strong);
		background: var(--paper);
		font-size: var(--text-label);
		font-weight: 600;
		color: var(--ink);
	}

	.step-body {
		display: grid;
		gap: var(--space-1);
		padding-block: var(--space-2);
		min-width: 0;
	}

	.step-body strong {
		font-weight: 600;
		color: var(--ink);
	}

	.hint {
		color: var(--ink-muted);
		font-size: var(--text-meta);
	}
</style>
