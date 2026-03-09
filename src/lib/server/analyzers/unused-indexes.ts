import type { Analyzer, Finding } from './types.js';

export const unusedIndexes: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			s.schemaname,
			s.relname AS tablename,
			s.indexrelname AS indexname,
			s.idx_scan,
			pg_relation_size(s.indexrelid) AS index_size,
			pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size_pretty,
			t.n_live_tup
		FROM pg_stat_user_indexes s
		JOIN pg_stat_user_tables t ON s.relid = t.relid
		WHERE s.idx_scan = 0
			AND t.n_live_tup > 1000
			AND s.indexrelname NOT LIKE '%_pkey'
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
