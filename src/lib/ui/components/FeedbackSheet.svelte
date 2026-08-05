<script lang="ts">
	import { page } from '$app/state';
	import {
		FeedbackSubmitError,
		submitUserFeedback
	} from '$lib/monitoring/submit-feedback';
	import { actionToast } from '$lib/state/action-toast';
	import { audiotoolAuth } from '$lib/state/audiotool-auth.svelte';
	import {
		closeFeedbackOverlay,
		feedbackOverlay
	} from '$lib/state/feedback-overlay.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';

	let message = $state('');
	let busy = $state(false);

	const open = $derived(feedbackOverlay.open);
	const canSend = $derived(message.trim().length > 0 && !busy);

	function prepareTextarea(node: HTMLTextAreaElement) {
		message = '';
		busy = false;
		node.focus();
	}

	function onclose() {
		if (busy) return;
		closeFeedbackOverlay();
	}

	async function onSend() {
		if (!canSend) return;
		busy = true;
		try {
			const auth = audiotoolAuth.status;
			await submitUserFeedback({
				message,
				routeId: page.route.id,
				name: auth.displayName || auth.userName,
				email: auth.email
			});
			actionToast.show('Feedback sent');
			closeFeedbackOverlay();
		} catch (error) {
			const text =
				error instanceof FeedbackSubmitError
					? error.message
					: 'Could not send feedback.';
			actionToast.show(text);
		} finally {
			busy = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void onSend();
		}
	}
</script>

{#if open}
	<SheetOverlay title="Send feedback" elevated dismissible={!busy} {onclose}>
		{#snippet footer()}
			<GhostButton disabled={busy} onclick={onclose}>Cancel</GhostButton>
			<PrimaryButton type="button" disabled={!canSend} onclick={() => void onSend()}>
				{busy ? 'Sending…' : 'Send'}
			</PrimaryButton>
		{/snippet}
		<div class="sheet">
			<p class="lead">
				Got a thought? If we reply, it’ll go to your Audiotool email.
			</p>
			<textarea
				{@attach prepareTextarea}
				class="control textarea"
				bind:value={message}
				rows="5"
				disabled={busy}
				onkeydown={onKeydown}
				placeholder="What's on your mind?"
				aria-label="Feedback message"
				enterkeyhint="send"
			></textarea>
		</div>
	</SheetOverlay>
{/if}

<style>
	.sheet {
		display: grid;
		gap: var(--space-4);
	}

	.lead {
		margin: 0;
		color: var(--ink-muted);
		max-width: 40rem;
	}

	.control {
		width: 100%;
		box-sizing: border-box;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		box-shadow:
			inset 0 var(--space-1) var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 50%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.control {
			transition: box-shadow 140ms ease;
		}
	}

	.control:focus {
		outline: none;
	}

	.control:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		box-shadow:
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			0 var(--space-2) var(--space-3) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 1px 0 var(--surface),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
	}

	.control:disabled {
		background: var(--surface-subtle);
		color: var(--disabled);
		box-shadow:
			inset 0 var(--space-1) var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 50%, transparent);
	}

	.textarea {
		min-height: calc(var(--touch-min) * 3);
		resize: vertical;
		line-height: 1.4;
	}
</style>
