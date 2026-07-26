<script lang="ts">
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
</script>

<svelte:head>
	<title>Account · SampleScout</title>
</svelte:head>

<!--
	OAuth redirect and deep-link host. Account UI is the sheet/modal in AppShell.
	Keep this route for PUBLIC_AUDIOTOOL_REDIRECT_URL.
-->
<AppShell />
