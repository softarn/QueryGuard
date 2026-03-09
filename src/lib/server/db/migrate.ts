import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH ?? 'data/app.db';

export function runMigrations() {
	const sqlite = new Database(DB_PATH);
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	sqlite.close();
}
