<script lang="ts">
	import FindingCard from './FindingCard.svelte';

	interface FindingData {
		id: string;
		severity: 'critical' | 'warning' | 'info';
		title: string;
		description: string;
		suggestion?: string | null;
		metadata?: Record<string, unknown> | null;
	}

	let { findings }: { findings: FindingData[] } = $props();

	const grouped = $derived({
		critical: findings.filter((f) => f.severity === 'critical'),
		warning: findings.filter((f) => f.severity === 'warning'),
		info: findings.filter((f) => f.severity === 'info')
	});

	const sectionLabels: Record<string, string> = {
		critical: 'Critical Issues',
		warning: 'Warnings',
		info: 'Informational'
	};
</script>

{#each ['critical', 'warning', 'info'] as severity (severity)}
	{@const items = grouped[severity as keyof typeof grouped]}
	{#if items.length > 0}
		<div class="space-y-3">
			<h2 class="text-lg font-semibold text-gray-900">{sectionLabels[severity]} ({items.length})</h2>
			{#each items as finding (finding.id)}
				<FindingCard {finding} />
			{/each}
		</div>
	{/if}
{/each}
