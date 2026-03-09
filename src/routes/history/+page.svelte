<script lang="ts">
	import SnapshotTimeline from '$lib/components/SnapshotTimeline.svelte';

	let { data } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Analysis History</h1>
		<a
			href="/"
			class="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
		>
			Back
		</a>
	</div>

	<SnapshotTimeline snapshots={data.snapshots} />
</div>
