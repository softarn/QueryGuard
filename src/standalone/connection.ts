import pg from 'pg';

function getConfig() {
	if (process.env.DATABASE_URL) {
		return { connectionString: process.env.DATABASE_URL };
	}

	const host = process.env.PGHOST ?? 'localhost';
	const port = parseInt(process.env.PGPORT ?? '5432');
	const user = process.env.PGUSER ?? 'postgres';
	const password = process.env.PGPASSWORD ?? '';
	const database = process.env.PGDATABASE ?? 'postgres';

	return { host, port, user, password, database };
}

export async function connectTarget(): Promise<pg.Client> {
	const client = new pg.Client({
		...getConfig(),
		connectionTimeoutMillis: 5000,
		statement_timeout: 30000
	});
	await client.connect();
	return client;
}
