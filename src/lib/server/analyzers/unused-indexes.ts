import type { Analyzer, Finding } from './types.js';

export const unusedIndexes: Analyzer = async (client) => {
	// Skip if stats were reset recently — zero scans doesn't mean unused
	const resetResult = await client.query(`
		SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()
	`);
	const statsReset = resetResult.rows[0]?.stats_reset ? new Date(resetResult.rows[0].stats_reset) : null;
	const daysSinceReset = statsReset ? (Date.now() - statsReset.getTime()) / (1000 * 60 * 60 * 24) : null;

	if (daysSinceReset !== null && daysSinceReset < 7) {
		return [{
			analyzer: 'unused-indexes',
			severity: 'info',
			title: 'Stats too recent for unused index detection',
			description: `Database stats were reset ${daysSinceReset.toFixed(1)} days ago. Need at least 7 days of data to reliably detect unused indexes.`
		}];
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

	return findings;
};
