import type { Analyzer, Finding } from './types.js';

const timeConsuming: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			query,
			calls,
			total_exec_time,
			mean_exec_time,
			rows,
			(total_exec_time / sum(total_exec_time) OVER () * 100) AS pct_total_time
		FROM pg_stat_statements
		WHERE calls > 0
			AND query NOT LIKE '%pg_stat%'
		ORDER BY total_exec_time DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const pct = parseFloat(row.pct_total_time);
		if (pct > 15) {
			findings.push({
				analyzer: 'time-consuming',
				severity: pct > 30 ? 'critical' : 'warning',
				title: `Query consumes ${pct.toFixed(1)}% of total DB time`,
				description: `This query accounts for ${pct.toFixed(1)}% of all execution time (${(parseFloat(row.total_exec_time) / 1000).toFixed(1)}s total, ${row.calls} calls).`,
				suggestion: 'This is a high-impact optimization target. Even small improvements to this query will significantly reduce overall database load.',
				metadata: { query: row.query, calls: row.calls, total_exec_time: parseFloat(row.total_exec_time), pct_total_time: pct }
			});
		}
	}

	return { findings, rawData: result.rows };
};

export { timeConsuming };
