import type pg from 'pg';

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
	analyzer: string;
	severity: Severity;
	title: string;
	description: string;
	suggestion?: string;
	metadata?: Record<string, unknown>;
}

export interface AnalyzerOutput {
	findings: Finding[];
	rawData: Record<string, unknown>[];
}

export type Analyzer = (client: pg.Client) => Promise<AnalyzerOutput>;

export interface TableInfo {
	schema: string;
	name: string;
	estimated_rows: number;
	total_size: string;
	table_size: string;
	index_size: string;
}

export interface IndexInfo {
	schema: string;
	table: string;
	index: string;
	size: string;
	scans: number;
	is_unique: boolean;
	is_primary: boolean;
}

export interface DatabaseContext {
	database_size: string;
	tables: TableInfo[];
	indexes: IndexInfo[];
}
