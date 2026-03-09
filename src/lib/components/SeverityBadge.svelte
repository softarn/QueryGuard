<script lang="ts">
	let { severity }: { severity: 'critical' | 'warning' | 'info' } = $props();

	const classes: Record<string, string> = {
		critical: 'bg-red-100 text-red-800',
		warning: 'bg-yellow-100 text-yellow-800',
		info: 'bg-blue-100 text-blue-800'
	};
</script>

<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {classes[severity]}">
	{severity}
</span>
