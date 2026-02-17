-- Ensure only one emergency_fund goal per organization.
-- This cleans legacy duplicates and prevents new ones at DB level.

WITH ranked AS (
  SELECT
    id,
    org_id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id
      ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM goals
  WHERE type = 'emergency_fund'
)
DELETE FROM goals g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_one_emergency_per_org
ON goals (org_id)
WHERE type = 'emergency_fund';

