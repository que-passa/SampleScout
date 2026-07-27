<script lang="ts">
	import { openAccountOverlay } from '$lib/state/account-overlay';
	import { audiotoolAuth } from '$lib/state/audiotool-auth.svelte';
	import { Icon } from '$lib/ui/icons';
	import GhostButton from './GhostButton.svelte';

	let { expanded }: { expanded?: boolean } = $props();

	const connected = $derived(audiotoolAuth.status.state === 'connected');
	const avatarUrl = $derived(audiotoolAuth.status.avatarUrl);
	const navAvatarSrc = $derived(
		avatarUrl ? avatarUrl.replace('300x300.webp', '60x60.webp') : undefined
	);

	let failedSrc = $state<string | undefined>(undefined);

	const showAvatar = $derived(Boolean(navAvatarSrc) && navAvatarSrc !== failedSrc);
	const label = $derived(connected ? 'Account, connected' : 'Account');
</script>

<GhostButton
	icon
	muted
	active={expanded}
	live={connected}
	onclick={openAccountOverlay}
	aria-label={label}
	aria-haspopup="dialog"
	aria-expanded={expanded}
>
	{#if showAvatar}
		<img
			class="avatar"
			src={navAvatarSrc}
			alt=""
			width="24"
			height="24"
			onerror={() => {
				if (navAvatarSrc) failedSrc = navAvatarSrc;
			}}
		/>
	{:else}
		<Icon name="account" size={16} />
	{/if}
</GhostButton>
