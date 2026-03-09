import { connectTarget } from '../standalone/connection.js';
import { runAnalysis } from '../lib/server/analyzers/index.js';
import type { AnalysisResult } from '../lib/server/analyzers/index.js';
import type { Finding, Severity } from '../lib/server/analyzers/types.js';

const JULES_API_KEY = process.env.JULES_API_KEY;
const JULES_REPO_NAME = process.env.JULES_REPO_NAME;
const JULES_BASE_URL = 'https://jules.googleapis.com/v1alpha';

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

interface JulesSource {
	name: string;
	githubRepo: {
		repo: string;
		defaultBranch: { displayName: string };
	};
}

async function resolveSource(): Promise<{ name: string; defaultBranch: string }> {
	const res = await fetch(`${JULES_BASE_URL}/sources`, {
		headers: { 'X-Goog-Api-Key': JULES_API_KEY! }
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Jules sources API error ${res.status}: ${text}`);
	}

	const { sources } = (await res.json()) as { sources: JulesSource[] };
	const source = sources.find((s) => s.githubRepo.repo === JULES_REPO_NAME);
	if (!source) {
		const available = sources.map((s) => s.githubRepo.repo).join(', ');
		throw new Error(`Repo "${JULES_REPO_NAME}" not found. Available: ${available}`);
	}

	return { name: source.name, defaultBranch: source.githubRepo.defaultBranch.displayName };
}

function pickTopFinding(findings: Finding[]): Finding | undefined {
	return findings
		.filter((f) => !f.metadata?.error)
		.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0];
}

const SYSTEM_CONTEXT = `You are a Senior Database Architect and PostgreSQL Performance Specialist. \
Your goal is to diagnose and resolve performance or structural issues in PostgreSQL environments \
using static analysis of schema definitions, raw query data, and problem descriptions.

## Core competencies
- **Query Optimization**: Rewriting SQL for better join orders, avoiding CTE overhead (materialization), and utilizing modern PostgreSQL features (e.g., LATERAL joins, Window Functions).
- **Indexing Strategy**: Expertise in B-Tree, GIN, GIST, and BRIN indexes. Understanding of partial indexes, covering indexes (INCLUDE clause), and index-only scans.
- **Schema Refactoring**: Designing normalized structures, identifying data redundancy, and proposing partitioning or summary tables where necessary.
- **PostgreSQL Internals**: Predicting behavior related to MVCC, bloat, WAL overhead, and table bloat.

## Static analysis protocol
You do not have live access to the EXPLAIN engine. Apply these heuristics to the raw data provided:
- **Predicate Analysis**: Identify non-sargable WHERE clauses (operations on columns that prevent index usage).
- **Selectivity Estimation**: Based on the provided row counts, estimate which table should be the driving table in a join.
- **Join Logic**: Look for implicit cross-joins or inefficient nested loops on large datasets.
- **Write Impact**: Evaluate how new indexes or constraints will affect INSERT/UPDATE performance (write amplification).

## Operational guardrails
- Always prefer native PostgreSQL solutions (e.g., JSONB for semi-structured data, IDENTITY columns).
- When proposing schema changes (e.g., ALTER TABLE), specify if the operation is blocking (requires an Access Exclusive lock) and suggest concurrent alternatives if available (e.g., CREATE INDEX CONCURRENTLY).
- Provide solutions as valid SQL, regardless of which programming language or ORM is calling the database.

## Required output structure
For every issue, provide:
1. **Hypothesized Root Cause**: A technical explanation of the bottleneck based on PostgreSQL's query processing logic.
2. **Proposed SQL/Schema Change**: The exact DDL or DML required to fix the issue.
3. **Post-Change Behavior**: How the PostgreSQL planner is expected to handle the new query/structure (e.g., "This should transition from a Sequential Scan to an Index-Only Scan").
4. **Operational Risk**: Any impact on vacuuming, locking, or storage requirements.
`;

function buildPrompt(finding: Finding, result: AnalysisResult): string {
	let prompt = SYSTEM_CONTEXT;

	prompt += `\n---\n\n# Detected issue\n\n`;
	prompt += `QueryGuard found a **${finding.severity}** database issue:\n\n`;
	prompt += `**${finding.title}**\n${finding.description}\n`;
	if (finding.suggestion) {
		prompt += `\nOur suggestion (use your own judgement — this is only a starting point): ${finding.suggestion}\n`;
	}
	if (finding.metadata) {
		prompt += `\nMetadata: ${JSON.stringify(finding.metadata, null, 2)}\n`;
	}

	const ctx = result.databaseContext;
	prompt += `\n## Database context\n`;
	prompt += `Database size: ${ctx.database_size}\n`;
	prompt += `\n### Tables\n`;
	for (const t of ctx.tables) {
		prompt += `- ${t.schema}.${t.name}: ~${t.estimated_rows} rows, ${t.total_size} total (${t.table_size} data, ${t.index_size} indexes)\n`;
	}
	prompt += `\n### Indexes\n`;
	for (const i of ctx.indexes) {
		prompt += `- ${i.index} on ${i.schema}.${i.table}: ${i.size}, ${i.scans} scans${i.is_primary ? ' [PRIMARY]' : i.is_unique ? ' [UNIQUE]' : ''}\n`;
	}

	const rawRows = result.rawData[finding.analyzer];
	if (rawRows && rawRows.length > 0) {
		const capped = rawRows.slice(0, 100);
		prompt += `\n## Raw analyzer data (${capped.length}${rawRows.length > 100 ? ` of ${rawRows.length}` : ''} rows)\n`;
		prompt += `${JSON.stringify(capped, null, 2)}\n`;
	}

	prompt += `\nAnalyze the issue yourself using the database context and raw data above. Create a migration or code change to fix it. Prioritize a safe, backwards-compatible approach.`;
	return prompt;
}

async function createJulesSession(finding: Finding, result: AnalysisResult, sourceName: string, branch: string): Promise<string> {
	const body = {
		title: `[QueryGuard] ${finding.title}`,
		prompt: buildPrompt(finding, result),
		sourceContext: {
			source: sourceName,
			githubRepoContext: {
				startingBranch: branch
			}
		},
		automationMode: 'AUTO_CREATE_PR'
	};

	const res = await fetch(`${JULES_BASE_URL}/sessions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': JULES_API_KEY!
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Jules API error ${res.status}: ${text}`);
	}

	const session = await res.json();
	return session.name;
}

async function main() {
	if (!JULES_API_KEY) throw new Error('JULES_API_KEY is required');
	if (!JULES_REPO_NAME) throw new Error('JULES_REPO_NAME is required (e.g. "my-repo")');

	const { name: sourceName, defaultBranch } = await resolveSource();
	console.log(`Resolved source: ${sourceName} (branch: ${defaultBranch})`);

	console.log('Connecting to database...');
	const client = await connectTarget();

	try {
		console.log('Running analysis...');
		const result = await runAnalysis(client);
		console.log(`Found ${result.findings.length} findings`);

		const top = pickTopFinding(result.findings);
		if (!top) {
			console.log('No actionable findings. Skipping.');
			return;
		}

		console.log(`Top issue [${top.severity}]: ${top.title}`);
		const sessionName = await createJulesSession(top, result, sourceName, defaultBranch);
		console.log(`Created Jules session: ${sessionName}`);
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
