-- Standardize timestamps for agent_runs to ISO 8601 format

UPDATE agent_runs
SET started_at = REPLACE(started_at, ' ', 'T') || '.000Z'
WHERE started_at NOT LIKE '%T%';

UPDATE agent_runs
SET completed_at = REPLACE(completed_at, ' ', 'T') || '.000Z'
WHERE completed_at IS NOT NULL AND completed_at NOT LIKE '%T%';
