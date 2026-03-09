<script lang="ts">
	import AnalysisSummary from '$lib/components/AnalysisSummary.svelte';
	import FindingsList from '$lib/components/FindingsList.svelte';

	let { data } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Snapshot Detail</h1>
			<p class="text-sm text-gray-500 mt-1">
				{new Date(data.snapshot.startedAt).toLocaleString()}
			</p>
		</div>
		<a
			href="/history"
			class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
		>
			Back to History
		</a>
	</div>

	{#if data.snapshot.status === 'failed'}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
			Analysis failed: {data.snapshot.errorMessage}
		</div>
	{/if}

	{#if data.findings.length > 0}
		<AnalysisSummary findings={data.findings} />
		<FindingsList findings={data.findings} />
	{:else}
		<div class="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
			<p class="text-green-800 font-medium">No issues found in this snapshot.</p>
		</div>
	{/if}
</div>
