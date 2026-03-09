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
		const statsReset = row.stats_reset ? new Date(row.stats_reset) : null;
		if (!statsReset) continue;

		const minutesSinceReset = (Date.now() - statsReset.getTime()) / 60000;
		if (minutesSinceReset < 1) continue;

		const callsPerMinute = calls / minutesSinceReset;

		if (callsPerMinute > 100) {
			findings.push({
				analyzer: 'high-frequency',
				severity: callsPerMinute > 1000 ? 'critical' : 'warning',
				title: `High-frequency query (${callsPerMinute.toFixed(0)} calls/min)`,
				description: `This query runs ${callsPerMinute.toFixed(0)} times per minute (${calls} total calls). Mean execution: ${parseFloat(row.mean_exec_time).toFixed(1)}ms.`,
				suggestion: 'Consider caching results, batching calls, or using connection pooling to reduce query frequency.',
				metadata: { query: row.query, calls, calls_per_minute: callsPerMinute, mean_exec_time: parseFloat(row.mean_exec_time) }
			});
		}
	}

	return findings;
};
