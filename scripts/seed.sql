-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Reset stats for a clean baseline
SELECT pg_stat_statements_reset();
SELECT pg_stat_reset();

--------------------------------------------------------------------------------
-- 1. dead_tuples_demo
--    Trigger: dead-tuples analyzer (high dead/live ratio)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dead_tuples_demo (
    id serial PRIMARY KEY,
    payload text
);
TRUNCATE dead_tuples_demo;
INSERT INTO dead_tuples_demo (payload)
SELECT md5(random()::text)
FROM generate_series(1, 50000);
-- Delete 40% to create dead tuples
DELETE FROM dead_tuples_demo WHERE id % 5 IN (1, 2);

--------------------------------------------------------------------------------
-- 2. seq_scan_demo
--    Trigger: sequential-scans analyzer (no indexes, many seq scans)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seq_scan_demo (
    id serial,  -- no primary key index on purpose
    category int,
    value text
);
TRUNCATE seq_scan_demo;
INSERT INTO seq_scan_demo (category, value)
SELECT (random() * 100)::int, md5(random()::text)
FROM generate_series(1, 100000);
-- Run sequential scan queries many times
DO $$
BEGIN
    FOR i IN 1..200 LOOP
        PERFORM count(*) FROM seq_scan_demo WHERE category = 42;
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 3. unused_index_demo
--    Trigger: unused-indexes analyzer (indexes that are never queried)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unused_index_demo (
    id serial PRIMARY KEY,
    email text,
    status int,
    region text,
    score float
);
TRUNCATE unused_index_demo;
INSERT INTO unused_index_demo (email, status, region, score)
SELECT
    'user' || n || '@example.com',
    (random() * 5)::int,
    (ARRAY['us', 'eu', 'asia'])[1 + (random() * 2)::int],
    random() * 100
FROM generate_series(1, 5000) AS n;
-- Create indexes that will never be used
CREATE INDEX IF NOT EXISTS idx_unused_status ON unused_index_demo (status);
CREATE INDEX IF NOT EXISTS idx_unused_region ON unused_index_demo (region);
CREATE INDEX IF NOT EXISTS idx_unused_score ON unused_index_demo (score);
-- Only ever query by email (these indexes sit idle)
DO $$
BEGIN
    FOR i IN 1..10 LOOP
        PERFORM * FROM unused_index_demo WHERE email = 'user1@example.com';
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 4. slow_query_demo
--    Trigger: slow-queries analyzer (mean_exec_time > 1s)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slow_query_demo (
    id serial PRIMARY KEY,
    data text
);
TRUNCATE slow_query_demo;
INSERT INTO slow_query_demo (data)
SELECT md5(random()::text)
FROM generate_series(1, 1000);
-- Run intentionally slow queries using pg_sleep
SELECT pg_sleep(1.5), count(*) FROM slow_query_demo;
SELECT pg_sleep(1.5), count(*) FROM slow_query_demo;
SELECT pg_sleep(1.5), count(*) FROM slow_query_demo;

--------------------------------------------------------------------------------
-- 5. time_consuming_demo
--    Trigger: time-consuming analyzer (>15% of total DB time)
--    The slow queries above already dominate total time, but let's add more
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_consuming_demo (
    id serial PRIMARY KEY,
    a text,
    b text
);
TRUNCATE time_consuming_demo;
INSERT INTO time_consuming_demo (a, b)
SELECT md5(random()::text), md5(random()::text)
FROM generate_series(1, 50000);
-- Cross join to burn CPU time
SELECT count(*) FROM time_consuming_demo t1, time_consuming_demo t2 WHERE t1.id < 100 AND t2.id < 100 AND t1.a > t2.b;
SELECT count(*) FROM time_consuming_demo t1, time_consuming_demo t2 WHERE t1.id < 100 AND t2.id < 100 AND t1.a > t2.b;

--------------------------------------------------------------------------------
-- 6. high_frequency_demo
--    Trigger: high-frequency analyzer (>100 calls/min)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS high_frequency_demo (
    id serial PRIMARY KEY,
    status text
);
TRUNCATE high_frequency_demo;
INSERT INTO high_frequency_demo (status)
SELECT (ARRAY['active', 'inactive'])[1 + (random())::int]
FROM generate_series(1, 100);
-- Run a simple query thousands of times in quick succession
DO $$
BEGIN
    FOR i IN 1..5000 LOOP
        PERFORM count(*) FROM high_frequency_demo WHERE status = 'active';
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 7. excessive_rows_demo
--    Trigger: excessive-rows analyzer (>1000 rows per call)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS excessive_rows_demo (
    id serial PRIMARY KEY,
    category text,
    payload text
);
TRUNCATE excessive_rows_demo;
INSERT INTO excessive_rows_demo (category, payload)
SELECT 'cat_' || (random() * 3)::int, repeat(md5(random()::text), 10)
FROM generate_series(1, 200000);
-- Select everything without LIMIT — returns all 200k rows each time
SELECT * FROM excessive_rows_demo;
SELECT * FROM excessive_rows_demo;
SELECT * FROM excessive_rows_demo;

--------------------------------------------------------------------------------
-- 8. cache_ratio_demo (supporting table)
--    The cache hit ratio is database-wide. On a fresh DB with small shared_buffers
--    it may already be low, but the large unindexed scans above help push reads
--    to disk. This table adds more cold data.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cache_ratio_demo (
    id serial PRIMARY KEY,
    blob text
);
TRUNCATE cache_ratio_demo;
INSERT INTO cache_ratio_demo (blob)
SELECT repeat(md5(random()::text), 100)
FROM generate_series(1, 50000);
-- Force reads on cold data
SELECT count(*), sum(length(blob)) FROM cache_ratio_demo;
SELECT count(*), sum(length(blob)) FROM cache_ratio_demo WHERE blob LIKE '%abc%';

--------------------------------------------------------------------------------
-- Analyze all tables so pg_stat_user_tables is populated
--------------------------------------------------------------------------------
ANALYZE;
