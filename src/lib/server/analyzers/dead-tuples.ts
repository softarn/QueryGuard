import type { Analyzer, Finding } from './types.js';

/** Detects tables with high dead tuple ratios or stale vacuums from `pg_stat_user_tables`. */
const deadTuples: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			schemaname,
			relname,
			n_live_tup,
			n_dead_tup,
			CASE WHEN n_live_tup > 0
				THEN round(n_dead_tup::numeric / n_live_tup * 100, 2)
				ELSE 0
			END AS dead_ratio,
			last_autovacuum,
			last_vacuum
		FROM pg_stat_user_tables
		WHERE n_live_tup > 1000
		ORDER BY n_dead_tup DESC
	`);

	const findings: Finding[] = [];
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	for (const row of result.rows) {
		const deadRatio = parseFloat(row.dead_ratio);
		const lastVacuum = row.last_autovacuum ?? row.last_vacuum;
		const tableName = `${row.schemaname}.${row.relname}`;

		if (deadRatio > 10) {
			findings.push({
				analyzer: 'dead-tuples',
				severity: deadRatio > 25 ? 'critical' : 'warning',
				title: `High dead tuple ratio on ${tableName}: ${deadRatio}%`,
				description: `Table "${tableName}" has ${row.n_dead_tup} dead tuples vs ${row.n_live_tup} live tuples (${deadRatio}% dead).`,
				suggestion: `Run VACUUM ANALYZE ${tableName}; or check autovacuum settings for this table.`,
				metadata: {
					table: tableName,
					deadRatio,
					n_live_tup: row.n_live_tup,
					n_dead_tup: row.n_dead_tup,
					last_vacuum: lastVacuum
				}
			});
		}

		if (lastVacuum && new Date(lastVacuum) < sevenDaysAgo) {
			findings.push({
				analyzer: 'dead-tuples',
				severity: 'warning',
				title: `Stale vacuum on ${tableName}`,
				description: `Table "${tableName}" hasn't been vacuumed since ${new Date(lastVacuum).toISOString().split('T')[0]}.`,
				suggestion: `Check that autovacuum is enabled and properly configured for this table.`,
				metadata: { table: tableName, last_vacuum: lastVacuum }
			});
		}
	}

	return { findings, rawData: result.rows };
};

export { deadTuples };
