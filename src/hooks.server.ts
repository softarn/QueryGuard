import { runMigrations } from '$lib/server/db/migrate.js';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? 'data/app.db';
const dir = DB_PATH.substring(0, DB_PATH.lastIndexOf('/'));
if (dir && !fs.existsSync(dir)) {
	fs.mkdirSync(dir, { recursive: true });
}

runMigrations();
