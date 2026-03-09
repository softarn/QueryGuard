<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>QueryGuard</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<nav class="bg-white border-b border-gray-200">
		<div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
			<a href="/" class="text-lg font-bold text-gray-900">QueryGuard</a>
			<a href="/history" class="text-sm text-gray-600 hover:text-gray-900">History</a>
		</div>
	</nav>
	<main class="max-w-6xl mx-auto px-4 py-8">
		{@render children()}
	</main>
</div>
