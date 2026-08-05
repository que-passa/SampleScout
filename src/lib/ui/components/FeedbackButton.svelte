<script lang="ts">
	import { openFeedbackOverlay, feedbackOverlay } from '$lib/state/feedback-overlay.svelte';
	import { Icon } from '$lib/ui/icons';
	import GhostButton from './GhostButton.svelte';

	const expanded = $derived(feedbackOverlay.open);
</script>

<GhostButton
	icon
	active={expanded}
	onclick={openFeedbackOverlay}
	aria-label="Send feedback"
	title="Send feedback"
	aria-haspopup="dialog"
	aria-expanded={expanded}
>
	<Icon name="feedback" />
</GhostButton>
