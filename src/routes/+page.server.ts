import { db } from '$lib/server/db/app-db.js';
import { snapshots, findings } from '$lib/server/db/schema.js';
import { connectTarget } from '$lib/server/db/target-db.js';
import { runAnalysis } from '$lib/server/analyzers/index.js';
import { fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { Actions } from './$types.js';

export async function load() {
	const latestSnapshot = db
		.select()
		.from(snapshots)
		.orderBy(desc(snapshots.startedAt))
		.limit(1)
		.get();

	let snapshotFindings: (typeof findings.$inferSelect)[] = [];
	if (latestSnapshot) {
		snapshotFindings = db
			.select()
			.from(findings)
			.where(eq(findings.snapshotId, latestSnapshot.id))
			.all();
	}

	return {
		latestSnapshot,
		findings: snapshotFindings
	};
}

export const actions = {
	analyze: async () => {
		const snapshotId = crypto.randomUUID();
		const now = new Date().toISOString();

		db.insert(snapshots)
			.values({
				id: snapshotId,
				startedAt: now,
				status: 'running'
			})
			.run();

		let client;
		try {
			client = await connectTarget();
			const result = await runAnalysis(client);

			const summary = {
				critical: result.findings.filter((f) => f.severity === 'critical').length,
				warning: result.findings.filter((f) => f.severity === 'warning').length,
				info: result.findings.filter((f) => f.severity === 'info').length,
				hasPgStatStatements: result.hasPgStatStatements
			};

			for (const finding of result.findings) {
				db.insert(findings)
					.values({
						id: crypto.randomUUID(),
						snapshotId,
						analyzer: finding.analyzer,
						severity: finding.severity,
						title: finding.title,
						description: finding.description,
						suggestion: finding.suggestion ?? null,
						metadata: finding.metadata ?? null
					})
					.run();
			}

			db.update(snapshots)
				.set({
					status: 'completed',
					completedAt: new Date().toISOString(),
					summary
				})
				.where(eq(snapshots.id, snapshotId))
				.run();

			return { success: true };
		} catch (err) {
			db.update(snapshots)
				.set({
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: err instanceof Error ? err.message : String(err)
				})
				.where(eq(snapshots.id, snapshotId))
				.run();

			return fail(500, {
				error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`
			});
		} finally {
			await client?.end().catch(() => {});
		}
	}
} satisfies Actions;
