import type { Analyzer, Finding } from './types.js';

export const highFrequency: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			query,
			calls,
			total_exec_time,
			mean_exec_time,
			rows,
			stats_reset
		FROM pg_stat_statements
		CROSS JOIN (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS db
		WHERE calls > 100
			AND query NOT LIKE '%pg_stat%'
		ORDER BY calls DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const calls = parseInt(row.calls);
		const meanMs = parseFloat(row.mean_exec_time);
		const statsReset = row.stats_reset ? new Date(row.stats_reset) : null;
		if (!statsReset) continue;

		const minutesSinceReset = (Date.now() - statsReset.getTime()) / 60000;
		if (minutesSinceReset < 1) continue;

		const callsPerMinute = calls / minutesSinceReset;
		// DB time consumed per minute by this query (ms/min)
		const dbTimePerMinute = callsPerMinute * meanMs;

		// Only flag if the query actually consumes meaningful DB time.
		// A fast query running often is fine — a slow query running often is not.
		if (callsPerMinute > 100 && dbTimePerMinute > 1000) {
			findings.push({
				analyzer: 'high-frequency',
				severity: dbTimePerMinute > 10000 ? 'critical' : 'warning',
				title: `High-frequency query (${callsPerMinute.toFixed(0)} calls/min, ${(dbTimePerMinute / 1000).toFixed(1)}s DB time/min)`,
				description: `This query runs ${callsPerMinute.toFixed(0)} times per minute at ${meanMs.toFixed(1)}ms avg, consuming ${(dbTimePerMinute / 1000).toFixed(1)}s of DB time per minute.`,
				suggestion: 'Consider caching results, batching calls, or optimizing the query to reduce per-call execution time.',
				metadata: { query: row.query, calls, calls_per_minute: callsPerMinute, mean_exec_time: meanMs, db_time_per_minute_ms: dbTimePerMinute }
			});
		}
	}

	return findings;
};
