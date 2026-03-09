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

## MCP Server

QueryGuard includes a standalone MCP server that exposes its analyzers over HTTP, so an AI agent like Claude Code can consume findings and generate fixes.

```
Claude Code ──HTTP──▶ MCP server (Railway) ──private network──▶ Postgres (Railway)
```

### Deploy to Railway

1. In your Railway project, click **New → GitHub Repo** and select this repo
2. Under **Settings → Build**, set the Dockerfile path to `Dockerfile.mcp`
3. Add service variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   MCP_AUTH_TOKEN = <generate a secret token>
   PORT = 3001
   ```
4. Generate a public domain for the service (the MCP endpoint needs to be reachable by Claude Code)
5. Deploy

### Configure Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "queryguard": {
      "type": "http",
      "url": "https://<service>.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer ${QUERYGUARD_MCP_TOKEN}"
      }
    }
  }
}
```

Set the `QUERYGUARD_MCP_TOKEN` environment variable to the same value as `MCP_AUTH_TOKEN`.

### Available tools

| Tool | Description |
|------|-------------|
| `analyze_database` | Run all analyzers, returns findings as JSON |
| `get_findings` | Filter cached findings by severity or analyzer name |
| `explain_query` | Run `EXPLAIN (FORMAT JSON)` on a query (read-only) |

### Jules integration (cron)

A scheduled job can automatically analyze your database and create Jules sessions to fix the top issue. Jules will auto-create a PR with the fix.

```
Railway cron ──runs──▶ cron.ts ──analyze──▶ Postgres
                                ──create session──▶ Jules API ──PR──▶ GitHub
```

#### Deploy as Railway cron service

1. In your Railway project, click **New → GitHub Repo** and select this repo
2. Under **Settings → Build**, set the Dockerfile path to `Dockerfile.mcp`
3. Under **Settings → Deploy**, set the start command to `npx tsx src/jules/cron.ts`
4. Under **Settings → Cron**, set a schedule (e.g. `0 8 * * *` for daily at 8 AM UTC)
5. Add service variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   JULES_API_KEY = <your Jules API key from jules.google.com settings>
   JULES_REPO_NAME = <GitHub repo name, e.g. "my-repo">
   ```
6. Deploy

#### Run locally

```sh
DATABASE_URL=postgres://... JULES_API_KEY=... JULES_REPO_NAME=my-repo npm run jules:cron
```

### Run MCP server locally

```sh
DATABASE_URL=postgres://... npm run mcp
```

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
| `MCP_AUTH_TOKEN` | Bearer token for MCP server authentication | — |
| `PORT` | Port for the MCP server | `3001` |
| `JULES_API_KEY` | API key for Jules (from jules.google.com settings) | — |
| `JULES_REPO_NAME` | GitHub repo name to target (e.g. `my-repo`) | — |
