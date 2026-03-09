# QueryGuard

A Postgres monitoring dashboard that analyzes your database for performance issues — slow queries, missing indexes, sequential scans, dead tuples, and more. Built with SvelteKit and designed to run alongside your existing Postgres on Railway.

## Add to your Railway project

1. Push this repo to GitHub
2. In your Railway project, click **New → GitHub Repo** and select the repo
3. Add a service variable:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```
   Replace `Postgres` with the name of your Postgres service if it differs.
4. Add a volume mounted at `/data` (used for QueryGuard's internal SQLite database)
5. Deploy — QueryGuard will be available on port 3000

## Local development

Start a local Postgres with `pg_stat_statements` enabled:

```sh
docker compose up -d
```

Seed the database with demo data that triggers all analyzers:

```sh
docker compose exec -T postgres psql -U queryguard -d queryguard < scripts/seed.sql
```

Start the dev server:

```sh
npm install
npm run dev
```

Open http://localhost:5173 to see the dashboard.

## Security considerations

QueryGuard has **no built-in authentication**. Keep the service private to avoid exposing database performance data (query text, table names, schema structure) to unauthorized users.

- **Keep it private on Railway** — Don't generate a public domain for the QueryGuard service. Railway services are private by default and only accessible via internal networking. Use `railway service open` temporarily during development if needed.
- **Read-only access** — All analyzers only read from `pg_stat_*` views and `pg_stat_statements`. No data is modified in your target database. Suggestions like "DROP INDEX ..." are displayed as text and never executed.
- **Use a read-only Postgres role** (recommended) — Instead of connecting with the default superuser, create a dedicated role:
   ```sql
   CREATE ROLE queryguard_ro LOGIN PASSWORD '...';
   GRANT CONNECT ON DATABASE yourdb TO queryguard_ro;
   GRANT USAGE ON SCHEMA public TO queryguard_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO queryguard_ro;
   GRANT pg_read_all_stats TO queryguard_ro;
   ```
   Then set `DATABASE_URL` to use this role.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (preferred) | — |
| `PGHOST` | Postgres host (fallback if no `DATABASE_URL`) | `localhost` |
| `PGPORT` | Postgres port | `5432` |
| `PGUSER` | Postgres user | `postgres` |
| `PGPASSWORD` | Postgres password | — |
| `PGDATABASE` | Postgres database name | `postgres` |
| `DB_PATH` | Path to QueryGuard's internal SQLite database | `/data/app.db` |
