import type { Analyzer, Finding } from './types.js';

/** Finds queries returning a large number of rows per call, suggesting missing pagination or filters. Requires `pg_stat_statements`. */
const excessiveRows: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			query,
			calls,
			rows,
			CASE WHEN calls > 0 THEN rows::numeric / calls ELSE 0 END AS rows_per_call,
			mean_exec_time
		FROM pg_stat_statements
		WHERE calls > 0
			AND rows > 0
			AND query NOT LIKE '%pg_stat%'
		ORDER BY rows::numeric / calls DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const rowsPerCall = parseFloat(row.rows_per_call);
		if (rowsPerCall > 10000) {
			findings.push({
				analyzer: 'excessive-rows',
				severity: 'critical',
				title: `Query returns ${rowsPerCall.toFixed(0)} rows per call`,
				description: `This query returns an average of ${rowsPerCall.toFixed(0)} rows per execution (${row.rows} total rows, ${row.calls} calls).`,
				suggestion: 'Add LIMIT clauses, use pagination, or filter results more aggressively. Large result sets waste memory and network bandwidth.',
				metadata: { query: row.query, calls: row.calls, rows: row.rows, rows_per_call: rowsPerCall }
			});
		} else if (rowsPerCall > 1000) {
			findings.push({
				analyzer: 'excessive-rows',
				severity: 'warning',
				title: `Query returns ${rowsPerCall.toFixed(0)} rows per call`,
				description: `This query returns an average of ${rowsPerCall.toFixed(0)} rows per execution (${row.rows} total rows, ${row.calls} calls).`,
				suggestion: 'Consider if the application needs all these rows. Adding pagination or more specific WHERE clauses may improve performance.',
				metadata: { query: row.query, calls: row.calls, rows: row.rows, rows_per_call: rowsPerCall }
			});
		}
	}

	return { findings, rawData: result.rows };
};

export { excessiveRows };
