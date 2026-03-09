<script lang="ts">
	import SeverityBadge from './SeverityBadge.svelte';
	import QueryDisplay from './QueryDisplay.svelte';

	interface FindingData {
		severity: 'critical' | 'warning' | 'info';
		title: string;
		description: string;
		suggestion?: string | null;
		metadata?: Record<string, unknown> | null;
	}

	let { finding }: { finding: FindingData } = $props();

	const query = $derived(
		finding.metadata?.query ? String(finding.metadata.query) : null
	);
</script>

<div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
	<div class="flex items-start gap-3">
		<SeverityBadge severity={finding.severity} />
		<h3 class="text-sm font-semibold text-gray-900">{finding.title}</h3>
	</div>
	<p class="text-sm text-gray-600">{finding.description}</p>
	{#if query}
		<QueryDisplay {query} />
	{/if}
	{#if finding.suggestion}
		<div class="bg-green-50 border border-green-200 rounded-lg p-3">
			<p class="text-sm text-green-800"><span class="font-medium">Suggestion:</span> {finding.suggestion}</p>
		</div>
	{/if}
</div>
