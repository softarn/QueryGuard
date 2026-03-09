<script lang="ts">
	interface Snapshot {
		id: string;
		startedAt: string;
		completedAt: string | null;
		status: string;
		summary: { critical: number; warning: number; info: number } | null;
	}

	let { snapshots }: { snapshots: Snapshot[] } = $props();
</script>

{#if snapshots.length === 0}
	<p class="text-gray-500 text-sm">No analysis history yet.</p>
{:else}
	<div class="space-y-3">
		{#each snapshots as snapshot (snapshot.id)}
			<a
				href="/history/{snapshot.id}"
				class="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
			>
				<div class="flex items-center justify-between">
					<div>
						<span class="text-sm font-medium text-gray-900">
							{new Date(snapshot.startedAt).toLocaleString()}
						</span>
						<span class="ml-2 text-xs px-2 py-0.5 rounded-full {snapshot.status === 'completed'
							? 'bg-green-100 text-green-800'
							: snapshot.status === 'failed'
								? 'bg-red-100 text-red-800'
								: 'bg-yellow-100 text-yellow-800'}">
							{snapshot.status}
						</span>
					</div>
					{#if snapshot.summary}
						{@const s = snapshot.summary}
						<div class="flex gap-3 text-xs">
							{#if s.critical > 0}<span class="text-red-600">{s.critical} critical</span>{/if}
							{#if s.warning > 0}<span class="text-yellow-600">{s.warning} warnings</span>{/if}
							{#if s.info > 0}<span class="text-blue-600">{s.info} info</span>{/if}
						</div>
					{/if}
				</div>
			</a>
		{/each}
	</div>
{/if}
