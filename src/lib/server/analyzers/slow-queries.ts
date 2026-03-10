import type { Analyzer, Finding } from './types.js';

/** Finds queries with high average execution time from `pg_stat_statements`. Requires the extension. */
const slowQueries: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			query,
			calls,
			mean_exec_time,
			max_exec_time,
			total_exec_time,
			rows
		FROM pg_stat_statements
		WHERE calls > 5
			AND query NOT LIKE '%pg_stat%'
		ORDER BY mean_exec_time DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const meanMs = parseFloat(row.mean_exec_time);
		const calls = parseInt(row.calls);

		if (meanMs <= 1000) continue;

		// Weight severity by frequency: a slow query that runs often is worse
		// than a slow query that runs rarely.
		const isHighFrequency = calls > 100;
		const isVerySlow = meanMs > 5000;

		let severity: 'critical' | 'warning' | 'info';
		if (isVerySlow || (meanMs > 1000 && isHighFrequency)) {
			severity = 'critical';
		} else if (calls > 10) {
			severity = 'warning';
		} else {
			severity = 'info';
		}

		findings.push({
			analyzer: 'slow-queries',
			severity,
			title: `Slow query (avg ${(meanMs / 1000).toFixed(1)}s, ${calls} calls)`,
			description: `This query averages ${(meanMs / 1000).toFixed(1)}s per execution across ${calls} calls (${(parseFloat(row.total_exec_time) / 1000).toFixed(1)}s total).`,
			suggestion: 'Analyze the query plan with EXPLAIN ANALYZE and look for sequential scans, missing indexes, or inefficient joins.',
			metadata: { query: row.query, calls, mean_exec_time: meanMs, max_exec_time: parseFloat(row.max_exec_time), total_exec_time: parseFloat(row.total_exec_time) }
		});
	}

	return { findings, rawData: result.rows };
};

export { slowQueries };
