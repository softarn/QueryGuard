import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { connectTarget } from '../standalone/connection.js';
import { runAnalysis } from '../lib/server/analyzers';
import type { AnalysisResult } from '../lib/server/analyzers';

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const PORT = parseInt(process.env.PORT ?? '3001');

let cachedResult: AnalysisResult | null = null;

const mcpServer = new McpServer({
	name: 'queryguard',
	version: '1.0.0'
});

mcpServer.registerTool(
		'analyze_database',
		{
			description: 'Run all QueryGuard analyzers against the connected Postgres database. Returns findings about performance issues like slow queries, missing indexes, dead tuples, and more.',
			annotations: { readOnlyHint: true }
		},
		async () => {
			const client = await connectTarget();
			try {
				cachedResult = await runAnalysis(client);
				return {
					content: [{ type: 'text', text: JSON.stringify(cachedResult, null, 2) }]
				};
			} finally {
				await client.end();
			}
		}
	);

	mcpServer.registerTool(
		'get_findings',
		{
			description: 'Filter cached findings from the last analyze_database run by severity and/or analyzer name.',
			inputSchema: {
				severity: z.enum(['critical', 'warning', 'info']).optional().describe('Filter by severity level'),
				analyzer: z.string().optional().describe('Filter by analyzer name (e.g. "slow-queries", "dead-tuples")')
			},
			annotations: { readOnlyHint: true }
		},
		async ({ severity, analyzer }) => {
			if (!cachedResult) {
				return {
					content: [{ type: 'text', text: 'No cached analysis. Run analyze_database first.' }]
				};
			}

			let findings = cachedResult.findings;
			if (severity) {
				findings = findings.filter((f) => f.severity === severity);
			}
			if (analyzer) {
				findings = findings.filter((f) => f.analyzer === analyzer);
			}

			return {
				content: [{ type: 'text', text: JSON.stringify(findings, null, 2) }]
			};
		}
	);

	mcpServer.registerTool(
		'explain_query',
		{
			description: 'Run EXPLAIN (FORMAT JSON) on a SQL query to show the execution plan. Read-only — the query is not executed.',
			inputSchema: {
				query: z.string().describe('The SQL query to explain')
			},
			annotations: { readOnlyHint: true }
		},
		async ({ query }) => {
			const client = await connectTarget();
			try {
				const result = await client.query(`EXPLAIN (FORMAT JSON) ${query}`);
				return {
					content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }]
				};
			} finally {
				await client.end();
			}
		}
	);

const httpServer = createServer(async (req, res) => {
	if (AUTH_TOKEN && req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

	const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

	if (url.pathname === '/mcp') {
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		await mcpServer.connect(transport);
		await transport.handleRequest(req, res);
	} else if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok' }));
	} else {
		res.writeHead(404);
		res.end();
	}
});

httpServer.listen(PORT, () => {
	console.log(`QueryGuard MCP server listening on port ${PORT}`);
});
