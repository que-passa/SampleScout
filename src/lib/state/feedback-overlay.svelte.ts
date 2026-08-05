/** Shared Send-feedback sheet — stacks above Account via elevated SheetOverlay. */
export const feedbackOverlay = $state({
	open: false
});

export function openFeedbackOverlay(): void {
	feedbackOverlay.open = true;
}

export function closeFeedbackOverlay(): void {
	feedbackOverlay.open = false;
}
