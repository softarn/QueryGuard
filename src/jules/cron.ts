import { connectTarget } from '../standalone/connection.js';
import { runAnalysis } from '../lib/server/analyzers/index.js';
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

function buildPrompt(finding: Finding): string {
	let prompt = `QueryGuard found a ${finding.severity} database issue:\n\n`;
	prompt += `**${finding.title}**\n${finding.description}\n`;
	if (finding.suggestion) {
		prompt += `\nSuggested fix: ${finding.suggestion}\n`;
	}
	if (finding.metadata) {
		prompt += `\nMetadata: ${JSON.stringify(finding.metadata, null, 2)}\n`;
	}
	prompt += `\nPlease create a migration or code change to fix this issue. Prioritize a safe, backwards-compatible approach.`;
	return prompt;
}

async function createJulesSession(finding: Finding, sourceName: string, branch: string): Promise<string> {
	const body = {
		title: `[QueryGuard] ${finding.title}`,
		prompt: buildPrompt(finding),
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
		const { findings } = await runAnalysis(client);
		console.log(`Found ${findings.length} findings`);

		const top = pickTopFinding(findings);
		if (!top) {
			console.log('No actionable findings. Skipping.');
			return;
		}

		console.log(`Top issue [${top.severity}]: ${top.title}`);
		const sessionName = await createJulesSession(top, sourceName, defaultBranch);
		console.log(`Created Jules session: ${sessionName}`);
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
