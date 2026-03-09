import { db } from '$lib/server/db/app-db.js';
import { snapshots, findings } from '$lib/server/db/schema.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function load({ params }) {
	const snapshot = db.select().from(snapshots).where(eq(snapshots.id, params.snapshotId)).get();
	if (!snapshot) error(404, 'Snapshot not found');

	const snapshotFindings = db
		.select()
		.from(findings)
		.where(eq(findings.snapshotId, params.snapshotId))
		.all();

	return { snapshot, findings: snapshotFindings };
}
