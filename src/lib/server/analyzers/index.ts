import type pg from 'pg';
import type { Finding } from './types.js';
import { cacheHitRatio } from './cache-hit-ratio.js';
import { deadTuples } from './dead-tuples.js';
import { sequentialScans } from './sequential-scans.js';
import { unusedIndexes } from './unused-indexes.js';
import { slowQueries } from './slow-queries.js';
import { timeConsuming } from './time-consuming.js';
import { highFrequency } from './high-frequency.js';
import { excessiveRows } from './excessive-rows.js';

const alwaysAnalyzers = [
	{ name: 'cache-hit-ratio', fn: cacheHitRatio },
	{ name: 'dead-tuples', fn: deadTuples },
	{ name: 'sequential-scans', fn: sequentialScans },
	{ name: 'unused-indexes', fn: unusedIndexes }
];

const pgStatStatementsAnalyzers = [
	{ name: 'slow-queries', fn: slowQueries },
	{ name: 'time-consuming', fn: timeConsuming },
	{ name: 'high-frequency', fn: highFrequency },
	{ name: 'excessive-rows', fn: excessiveRows }
];

async function hasPgStatStatements(client: pg.Client): Promise<boolean> {
	try {
		const result = await client.query(
			"SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'"
		);
		return result.rows.length > 0;
	} catch {
		return false;
	}
}

export interface AnalysisResult {
	findings: Finding[];
	hasPgStatStatements: boolean;
}

export async function runAnalysis(client: pg.Client): Promise<AnalysisResult> {
	const findings: Finding[] = [];

	for (const analyzer of alwaysAnalyzers) {
		try {
			const results = await analyzer.fn(client);
			findings.push(...results);
		} catch (err) {
			findings.push({
				analyzer: analyzer.name,
				severity: 'info',
				title: `Analyzer "${analyzer.name}" failed`,
				description: `Error running analyzer: ${err instanceof Error ? err.message : String(err)}`,
				metadata: { error: true }
			});
		}
	}

	const hasPgSS = await hasPgStatStatements(client);
	if (hasPgSS) {
		for (const analyzer of pgStatStatementsAnalyzers) {
			try {
				const results = await analyzer.fn(client);
				findings.push(...results);
			} catch (err) {
				findings.push({
					analyzer: analyzer.name,
					severity: 'info',
					title: `Analyzer "${analyzer.name}" failed`,
					description: `Error running analyzer: ${err instanceof Error ? err.message : String(err)}`,
					metadata: { error: true }
				});
			}
		}
	} else {
		findings.push({
			analyzer: 'pg_stat_statements',
			severity: 'info',
			title: 'pg_stat_statements extension not installed',
			description:
				'Query-level analysis (slow queries, high frequency, excessive rows) requires the pg_stat_statements extension.',
			suggestion:
				"Install it with: CREATE EXTENSION pg_stat_statements; and add shared_preload_libraries = 'pg_stat_statements' to postgresql.conf."
		});
	}

	return { findings, hasPgStatStatements: hasPgSS };
}
