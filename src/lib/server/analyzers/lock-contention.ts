import type { Analyzer, Finding } from './types.js';

export const lockContention: Analyzer = async (client) => {
	// Find queries currently blocked by locks
	const blockedResult = await client.query(`
		SELECT
			blocked.pid AS blocked_pid,
			blocked.query AS blocked_query,
			blocked.wait_event_type,
			blocked.wait_event,
			EXTRACT(EPOCH FROM now() - blocked.query_start)::numeric AS wait_seconds,
			blocker.pid AS blocker_pid,
			blocker.query AS blocker_query,
			blocker.state AS blocker_state
		FROM pg_stat_activity blocked
		JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
		JOIN pg_locks gl ON gl.locktype = bl.locktype
			AND gl.database IS NOT DISTINCT FROM bl.database
			AND gl.relation IS NOT DISTINCT FROM bl.relation
			AND gl.page IS NOT DISTINCT FROM bl.page
			AND gl.tuple IS NOT DISTINCT FROM bl.tuple
			AND gl.virtualxid IS NOT DISTINCT FROM bl.virtualxid
			AND gl.transactionid IS NOT DISTINCT FROM bl.transactionid
			AND gl.classid IS NOT DISTINCT FROM bl.classid
			AND gl.objid IS NOT DISTINCT FROM bl.objid
			AND gl.objsubid IS NOT DISTINCT FROM bl.objsubid
			AND gl.pid != bl.pid
			AND gl.granted
		JOIN pg_stat_activity blocker ON blocker.pid = gl.pid
		WHERE blocked.state = 'active'
		ORDER BY wait_seconds DESC
		LIMIT 20
	`);

	const findings: Finding[] = [];

	for (const row of blockedResult.rows) {
		const waitSeconds = parseFloat(row.wait_seconds);
		if (waitSeconds < 1) continue;

		findings.push({
			analyzer: 'lock-contention',
			severity: waitSeconds > 30 ? 'critical' : 'warning',
			title: `Blocked query waiting ${waitSeconds.toFixed(0)}s for lock`,
			description: `PID ${row.blocked_pid} has been waiting ${waitSeconds.toFixed(0)}s for a lock held by PID ${row.blocker_pid} (${row.blocker_state}).`,
			suggestion: 'Investigate the blocking query. Consider shorter transactions, advisory locks, or SKIP LOCKED for queue patterns.',
			metadata: {
				blocked_pid: row.blocked_pid,
				blocked_query: row.blocked_query,
				blocker_pid: row.blocker_pid,
				blocker_query: row.blocker_query,
				blocker_state: row.blocker_state,
				wait_seconds: waitSeconds,
				wait_event: `${row.wait_event_type}:${row.wait_event}`
			}
		});
	}

	// Check for tables with historically high lock waits
	const lockWaitResult = await client.query(`
		SELECT
			schemaname,
			relname,
			n_live_tup,
			COALESCE(n_dead_tup, 0) AS n_dead_tup,
			COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0) AS total_scans
		FROM pg_stat_user_tables
		WHERE COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0) > 0
		ORDER BY COALESCE(seq_scan, 0) + COALESCE(idx_scan, 0) DESC
	`);

	// Check for long-running transactions that may hold locks
	const longTxResult = await client.query(`
		SELECT
			pid,
			state,
			query,
			EXTRACT(EPOCH FROM now() - xact_start)::numeric AS xact_seconds
		FROM pg_stat_activity
		WHERE state != 'idle'
			AND xact_start IS NOT NULL
			AND EXTRACT(EPOCH FROM now() - xact_start) > 60
			AND pid != pg_backend_pid()
		ORDER BY xact_start
		LIMIT 10
	`);

	for (const row of longTxResult.rows) {
		const xactSeconds = parseFloat(row.xact_seconds);
		findings.push({
			analyzer: 'lock-contention',
			severity: xactSeconds > 300 ? 'critical' : 'warning',
			title: `Long-running transaction (${(xactSeconds / 60).toFixed(1)} min)`,
			description: `PID ${row.pid} has an open transaction for ${(xactSeconds / 60).toFixed(1)} minutes (state: ${row.state}). Long transactions hold locks and prevent vacuum.`,
			suggestion: 'Ensure transactions are short-lived. Move non-transactional work (API calls, file I/O) outside the transaction.',
			metadata: {
				pid: row.pid,
				state: row.state,
				query: row.query,
				xact_seconds: xactSeconds
			}
		});
	}

	return findings;
};
