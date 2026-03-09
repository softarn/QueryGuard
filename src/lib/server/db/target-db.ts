import pg from 'pg';
import { env } from '$env/dynamic/private';

export function getTargetConfig() {
	if (env.DATABASE_URL) {
		return { connectionString: env.DATABASE_URL };
	}

	const host = env.PGHOST ?? 'localhost';
	const port = parseInt(env.PGPORT ?? '5432');
	const user = env.PGUSER ?? 'postgres';
	const password = env.PGPASSWORD ?? '';
	const database = env.PGDATABASE ?? 'postgres';

	return { host, port, user, password, database };
}

export async function connectTarget(): Promise<pg.Client> {
	const client = new pg.Client({
		...getTargetConfig(),
		connectionTimeoutMillis: 5000,
		statement_timeout: 30000
	});
	await client.connect();
	return client;
}
