<script lang="ts">
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
</script>

<svelte:head>
	<title>Account · SampleScout</title>
</svelte:head>

<!--
	Account deep-link host. Account UI is the sheet/modal in AppShell.
	OAuth redirect is /capture (PUBLIC_AUDIOTOOL_REDIRECT_URL).
-->
<AppShell />
