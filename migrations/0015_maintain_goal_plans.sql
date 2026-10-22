-- Maintain plans have no end date, so target_date must be nullable. SQLite
-- can't drop NOT NULL in place, so rebuild the table. Nothing references it.
CREATE TABLE goal_plans_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_weight_value REAL NOT NULL,
  goal_weight_unit TEXT NOT NULL DEFAULT 'lb',
  target_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  kind TEXT NOT NULL DEFAULT 'target',
  prompt_snoozed_until TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO goal_plans_new (id, user_id, goal_weight_value, goal_weight_unit, target_date, is_active, created_at, updated_at, archived_at)
SELECT id, user_id, goal_weight_value, goal_weight_unit, target_date, is_active, created_at, updated_at, archived_at FROM goal_plans;

DROP TABLE goal_plans;
ALTER TABLE goal_plans_new RENAME TO goal_plans;
CREATE INDEX goal_plans_user_active_N1 ON goal_plans(user_id, is_active);
