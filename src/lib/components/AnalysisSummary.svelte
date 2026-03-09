<script lang="ts">
	interface FindingData {
		severity: 'critical' | 'warning' | 'info';
	}

	let { findings }: { findings: FindingData[] } = $props();

	const counts = $derived({
		critical: findings.filter((f) => f.severity === 'critical').length,
		warning: findings.filter((f) => f.severity === 'warning').length,
		info: findings.filter((f) => f.severity === 'info').length
	});
</script>

<div class="grid grid-cols-3 gap-4">
	<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
		<div class="text-2xl font-bold text-red-700">{counts.critical}</div>
		<div class="text-sm text-red-600">Critical</div>
	</div>
	<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
		<div class="text-2xl font-bold text-yellow-700">{counts.warning}</div>
		<div class="text-sm text-yellow-600">Warnings</div>
	</div>
	<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
		<div class="text-2xl font-bold text-blue-700">{counts.info}</div>
		<div class="text-sm text-blue-600">Info</div>
	</div>
</div>
