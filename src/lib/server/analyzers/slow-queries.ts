import type { Analyzer, Finding } from './types.js';

export const slowQueries: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			query,
			calls,
			mean_exec_time,
			max_exec_time,
			total_exec_time,
			rows
		FROM pg_stat_statements
		WHERE calls > 0
			AND query NOT LIKE '%pg_stat%'
		ORDER BY mean_exec_time DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const meanMs = parseFloat(row.mean_exec_time);
		if (meanMs > 5000) {
			findings.push({
				analyzer: 'slow-queries',
				severity: 'critical',
				title: `Very slow query (avg ${(meanMs / 1000).toFixed(1)}s)`,
				description: `This query averages ${(meanMs / 1000).toFixed(1)}s per execution across ${row.calls} calls.`,
				suggestion: 'Analyze the query plan with EXPLAIN ANALYZE and look for sequential scans, missing indexes, or inefficient joins.',
				metadata: { query: row.query, calls: row.calls, mean_exec_time: meanMs, max_exec_time: parseFloat(row.max_exec_time) }
			});
		} else if (meanMs > 1000) {
			findings.push({
				analyzer: 'slow-queries',
				severity: 'warning',
				title: `Slow query (avg ${(meanMs / 1000).toFixed(1)}s)`,
				description: `This query averages ${(meanMs / 1000).toFixed(1)}s per execution across ${row.calls} calls.`,
				suggestion: 'Review the query plan and consider adding indexes or restructuring the query.',
				metadata: { query: row.query, calls: row.calls, mean_exec_time: meanMs, max_exec_time: parseFloat(row.max_exec_time) }
			});
		}
	}

	return findings;
};
