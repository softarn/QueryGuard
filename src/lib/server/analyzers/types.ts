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

export type Analyzer = (client: pg.Client) => Promise<Finding[]>;
