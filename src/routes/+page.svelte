<script lang="ts">
	import { enhance } from '$app/forms';
	import AnalysisSummary from '$lib/components/AnalysisSummary.svelte';
	import FindingsList from '$lib/components/FindingsList.svelte';

	let { data, form } = $props();
	let analyzing = $state(false);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Database Analysis</h1>
		<div class="flex gap-3">
			<a
				href="/history"
				class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
			>
				History
			</a>
			<form
				method="POST"
				action="?/analyze"
				use:enhance={() => {
					analyzing = true;
					return async ({ update }) => {
						analyzing = false;
						await update();
					};
				}}
			>
				<button
					type="submit"
					disabled={analyzing}
					class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
				>
					{analyzing ? 'Analyzing...' : 'Run Analysis'}
				</button>
			</form>
		</div>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{form.error}</div>
	{/if}

	{#if data.latestSnapshot}
		<p class="text-sm text-gray-500">
			Last analyzed: {new Date(data.latestSnapshot.startedAt).toLocaleString()}
		</p>
	{/if}

	{#if data.findings.length > 0}
		<AnalysisSummary findings={data.findings} />
		<FindingsList findings={data.findings} />
	{:else if data.latestSnapshot}
		<div class="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
			<p class="text-green-800 font-medium">No issues found!</p>
			<p class="text-green-600 text-sm mt-1">Your database looks healthy.</p>
		</div>
	{:else}
		<div class="bg-white border border-gray-200 rounded-lg p-8 text-center">
			<p class="text-gray-600">Click "Run Analysis" to analyze your database for performance issues.</p>
		</div>
	{/if}
</div>
