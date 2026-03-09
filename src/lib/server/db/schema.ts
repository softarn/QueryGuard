import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const snapshots = sqliteTable('snapshots', {
	id: text('id').primaryKey(),
	startedAt: text('started_at').notNull(),
	completedAt: text('completed_at'),
	status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
	errorMessage: text('error_message'),
	summary: text('summary', { mode: 'json' }),
	rawStats: text('raw_stats', { mode: 'json' })
});

export const findings = sqliteTable('findings', {
	id: text('id').primaryKey(),
	snapshotId: text('snapshot_id')
		.notNull()
		.references(() => snapshots.id),
	analyzer: text('analyzer').notNull(),
	severity: text('severity', { enum: ['critical', 'warning', 'info'] }).notNull(),
	title: text('title').notNull(),
	description: text('description').notNull(),
	suggestion: text('suggestion'),
	metadata: text('metadata', { mode: 'json' })
});
