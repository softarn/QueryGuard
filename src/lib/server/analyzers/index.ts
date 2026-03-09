import type pg from 'pg';
import type { DatabaseContext, Finding } from './types.js';
import { cacheHitRatio } from './cache-hit-ratio.js';
import { deadTuples } from './dead-tuples.js';
import { sequentialScans } from './sequential-scans.js';
import { unusedIndexes } from './unused-indexes.js';
import { slowQueries } from './slow-queries.js';
import { timeConsuming } from './time-consuming.js';
import { highFrequency } from './high-frequency.js';
import { excessiveRows } from './excessive-rows.js';
import { lockContention } from './lock-contention.js';

const alwaysAnalyzers = [
	{ name: 'cache-hit-ratio', fn: cacheHitRatio },
	{ name: 'dead-tuples', fn: deadTuples },
	{ name: 'sequential-scans', fn: sequentialScans },
	{ name: 'unused-indexes', fn: unusedIndexes },
	{ name: 'lock-contention', fn: lockContention }
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

async function collectDatabaseContext(client: pg.Client): Promise<DatabaseContext> {
	const dbSizeResult = await client.query(
		`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
	);

	const tablesResult = await client.query(`
		SELECT
			schemaname AS schema,
			relname AS name,
			n_live_tup AS estimated_rows,
			pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
			pg_size_pretty(pg_table_size(relid)) AS table_size,
			pg_size_pretty(pg_indexes_size(relid)) AS index_size
		FROM pg_stat_user_tables
		ORDER BY pg_total_relation_size(relid) DESC
	`);

	const indexesResult = await client.query(`
		SELECT
			s.schemaname AS schema,
			s.relname AS table,
			s.indexrelname AS index,
			pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
			s.idx_scan AS scans,
			ix.indisunique AS is_unique,
			ix.indisprimary AS is_primary
		FROM pg_stat_user_indexes s
		JOIN pg_index ix ON s.indexrelid = ix.indexrelid
		ORDER BY pg_relation_size(s.indexrelid) DESC
	`);

	return {
		database_size: dbSizeResult.rows[0].size,
		tables: tablesResult.rows.map((r) => ({
			schema: r.schema,
			name: r.name,
			estimated_rows: parseInt(r.estimated_rows),
			total_size: r.total_size,
			table_size: r.table_size,
			index_size: r.index_size
		})),
		indexes: indexesResult.rows.map((r) => ({
			schema: r.schema,
			table: r.table,
			index: r.index,
			size: r.size,
			scans: parseInt(r.scans),
			is_unique: r.is_unique,
			is_primary: r.is_primary
		}))
	};
}

export interface AnalysisResult {
	findings: Finding[];
	rawData: Record<string, Record<string, unknown>[]>;
	hasPgStatStatements: boolean;
	databaseContext: DatabaseContext;
}

export async function runAnalysis(client: pg.Client): Promise<AnalysisResult> {
	const findings: Finding[] = [];
	const rawData: Record<string, Record<string, unknown>[]> = {};

	for (const analyzer of alwaysAnalyzers) {
		try {
			const output = await analyzer.fn(client);
			findings.push(...output.findings);
			rawData[analyzer.name] = output.rawData;
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
				const output = await analyzer.fn(client);
				findings.push(...output.findings);
				rawData[analyzer.name] = output.rawData;
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

	const databaseContext = await collectDatabaseContext(client);

	return { findings, rawData, hasPgStatStatements: hasPgSS, databaseContext };
}
