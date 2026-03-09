import type pg from 'pg';
import type { Analyzer, Finding } from './types.js';

async function daysSinceStatsReset(client: pg.Client): Promise<number | undefined> {
	const result = await client.query(`
		SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()
	`);

	const statsReset = result.rows[0]?.stats_reset;
	if (!statsReset) return undefined;

	return (Date.now() - new Date(statsReset).getTime()) / (1000 * 60 * 60 * 24);
}

/** Finds non-primary, non-unique indexes with zero scans. Requires at least 30 days of stats. */
const unusedIndexes: Analyzer = async (client) => {
	const days = await daysSinceStatsReset(client);

	if (days == undefined) {
		return { findings: [], rawData: [] };
	}

	if (days < 30) {
		return { findings: [], rawData: [] };
	}

	const result = await client.query(`
		SELECT
			s.schemaname,
			s.relname AS tablename,
			s.indexrelname AS indexname,
			s.idx_scan,
			pg_relation_size(s.indexrelid) AS index_size,
			pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size_pretty,
			t.n_live_tup,
			ix.indisunique
		FROM pg_stat_user_indexes s
		JOIN pg_stat_user_tables t ON s.relid = t.relid
		JOIN pg_index ix ON s.indexrelid = ix.indexrelid
		WHERE s.idx_scan = 0
			AND t.n_live_tup > 1000
			AND NOT ix.indisprimary
			AND NOT ix.indisunique
		ORDER BY pg_relation_size(s.indexrelid) DESC
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const tableName = `${row.schemaname}.${row.tablename}`;
		findings.push({
			analyzer: 'unused-indexes',
			severity: parseInt(row.index_size) > 10 * 1024 * 1024 ? 'warning' : 'info',
			title: `Unused index: ${row.indexname}`,
			description: `Index "${row.indexname}" on table "${tableName}" (${row.n_live_tup} rows) has never been used. It uses ${row.index_size_pretty} of disk space.`,
			suggestion: `Consider dropping this index with DROP INDEX ${row.indexname}; to save disk space and improve write performance.`,
			metadata: {
				table: tableName,
				index: row.indexname,
				index_size: parseInt(row.index_size),
				index_size_pretty: row.index_size_pretty
			}
		});
	}

	return { findings, rawData: result.rows };
};

export { unusedIndexes };
