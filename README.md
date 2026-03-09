# QueryGuard

Postgres performance analyzer — detects slow queries, missing indexes, sequential scans, dead tuples, and more. Exposes findings via an MCP server for AI agents and can auto-create fix PRs via Jules.

## Deploy to Railway

Both services share this repo. Configure each one separately in the Railway UI.

### MCP Server

```
Claude Code ──HTTP──▶ MCP server (Railway) ──private network──▶ Postgres (Railway)
```

1. In your Railway project, click **New → GitHub Repo** and select this repo
2. Under **Settings → Build**, select **Dockerfile** as the builder
3. Add service variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   MCP_AUTH_TOKEN = <generate a secret token>
   PORT = 3001
   ```
4. Under **Settings → Deploy**, set healthcheck path to `/health`
5. Under **Settings → Networking**, generate a public domain (the MCP endpoint needs to be reachable by Claude Code)
6. Deploy

#### Configure Claude Code

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

#### Available tools

| Tool | Description |
|------|-------------|
| `analyze_database` | Run all analyzers, returns findings, raw data, and database context as JSON |
| `explain_query` | Run `EXPLAIN (FORMAT JSON)` on a query (read-only) |

### Jules cron

A scheduled job that analyzes your database and creates a Jules session to fix the top issue. Jules auto-creates a PR with the fix.

```
Railway cron ──runs──▶ cron.ts ──analyze──▶ Postgres
                                ──create session──▶ Jules API ──PR──▶ GitHub
```

1. In your Railway project, click **New → GitHub Repo** and select this repo
2. Under **Settings → Build**, select **Nixpacks** as the builder (not Dockerfile)
3. Under **Settings → Deploy**, set the start command to `npx tsx src/jules/cron.ts`
4. Under **Settings → Cron**, set a schedule (e.g. `0 8 * * *` for daily at 8 AM UTC)
5. Add service variables:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   JULES_API_KEY = <your Jules API key from jules.google.com settings>
   JULES_REPO_NAME = <GitHub repo name, e.g. "my-repo">
   ```
6. Deploy

## Local development

Start a local Postgres with `pg_stat_statements` enabled:

```sh
docker compose up -d
```

Seed the database with demo data that triggers all analyzers:

```sh
docker compose exec -T postgres psql -U queryguard -d queryguard < scripts/seed.sql
```

Run the MCP server:

```sh
npm install
DATABASE_URL=postgres://queryguard:queryguard@localhost:5432/queryguard npm run mcp
```

Run the Jules cron locally:

```sh
DATABASE_URL=postgres://... JULES_API_KEY=... JULES_REPO_NAME=my-repo npm run jules:cron
```

## Security considerations

- **Read-only access** — All analyzers only read from `pg_stat_*` views and `pg_stat_statements`. No data is modified in your target database.
- **Use a read-only Postgres role** (recommended):
   ```sql
   CREATE ROLE queryguard_ro LOGIN PASSWORD '...';
   GRANT CONNECT ON DATABASE yourdb TO queryguard_ro;
   GRANT USAGE ON SCHEMA public TO queryguard_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO queryguard_ro;
   GRANT pg_read_all_stats TO queryguard_ro;
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
| `MCP_AUTH_TOKEN` | Bearer token for MCP server authentication | — |
| `PORT` | Port for the MCP server | `3001` |
| `JULES_API_KEY` | API key for Jules (from jules.google.com settings) | — |
| `JULES_REPO_NAME` | GitHub repo name to target (e.g. `my-repo`) | — |
