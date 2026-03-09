import type { Analyzer, Finding } from './types.js';

const sequentialScans: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			schemaname,
			relname,
			seq_scan,
			seq_tup_read,
			idx_scan,
			idx_tup_fetch,
			n_live_tup
		FROM pg_stat_user_tables
		WHERE seq_scan > 0
			AND n_live_tup > 10000
		ORDER BY seq_tup_read DESC
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const tableName = `${row.schemaname}.${row.relname}`;
		const seqScan = parseInt(row.seq_scan);
		const idxScan = parseInt(row.idx_scan ?? '0');
		const seqTupRead = parseInt(row.seq_tup_read);
		const liveTup = parseInt(row.n_live_tup);

		// Flag tables where sequential scans dominate and read many tuples
		if (seqScan > 100 && seqTupRead > 100000 && (idxScan === 0 || seqScan > idxScan * 10)) {
			findings.push({
				analyzer: 'sequential-scans',
				severity: seqTupRead > 1000000 ? 'critical' : 'warning',
				title: `Excessive sequential scans on ${tableName}`,
				description: `Table "${tableName}" (${liveTup} rows) has ${seqScan} sequential scans reading ${seqTupRead} tuples total, but only ${idxScan} index scans.`,
				suggestion: `Consider adding indexes for common query patterns on this table. Run EXPLAIN ANALYZE on frequent queries to identify missing indexes.`,
				metadata: {
					table: tableName,
					seq_scan: seqScan,
					seq_tup_read: seqTupRead,
					idx_scan: idxScan,
					n_live_tup: liveTup
				}
			});
		}
	}

	return { findings, rawData: result.rows };
};

export { sequentialScans };
