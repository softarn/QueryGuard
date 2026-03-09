import { db } from '$lib/server/db/app-db.js';
import { snapshots } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';

export async function load() {
	const allSnapshots = db
		.select()
		.from(snapshots)
		.orderBy(desc(snapshots.startedAt))
		.all();

	return { snapshots: allSnapshots };
}
