import type { Analyzer, Finding } from './types.js';

const cacheHitRatio: Analyzer = async (client) => {
	const result = await client.query(`
		SELECT
			datname,
			blks_hit,
			blks_read,
			CASE WHEN blks_hit + blks_read > 0
				THEN round(blks_hit::numeric / (blks_hit + blks_read) * 100, 2)
				ELSE 100
			END AS hit_ratio
		FROM pg_stat_database
		WHERE datname = current_database()
	`);

	const findings: Finding[] = [];

	for (const row of result.rows) {
		const ratio = parseFloat(row.hit_ratio);
		if (ratio < 90) {
			findings.push({
				analyzer: 'cache-hit-ratio',
				severity: 'critical',
				title: `Low cache hit ratio: ${ratio}%`,
				description: `Database "${row.datname}" has a cache hit ratio of ${ratio}%. This means PostgreSQL is frequently reading from disk instead of memory.`,
				suggestion:
					'Consider increasing shared_buffers or effective_cache_size. Ensure the server has enough RAM for the working dataset.',
				metadata: { datname: row.datname, ratio, blks_hit: row.blks_hit, blks_read: row.blks_read }
			});
		} else if (ratio < 95) {
			findings.push({
				analyzer: 'cache-hit-ratio',
				severity: 'warning',
				title: `Suboptimal cache hit ratio: ${ratio}%`,
				description: `Database "${row.datname}" has a cache hit ratio of ${ratio}%. Ideally this should be above 99%.`,
				suggestion:
					'Consider increasing shared_buffers. Monitor if the ratio improves after tuning.',
				metadata: { datname: row.datname, ratio, blks_hit: row.blks_hit, blks_read: row.blks_read }
			});
		}
	}

	return { findings, rawData: result.rows };
};

export { cacheHitRatio };
