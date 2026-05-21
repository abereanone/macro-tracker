CREATE TABLE user_maintenance_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  calculated_date TEXT NOT NULL,
  maintenance_calories REAL NOT NULL,
  source TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  calorie_start_date TEXT,
  calorie_end_date TEXT,
  period_days INTEGER,
  logged_day_count INTEGER,
  average_logged_calories REAL,
  estimated_period_calories REAL,
  weight_change_lb REAL,
  daily_weight_adjustment REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX user_maintenance_snapshots_user_date_N1
  ON user_maintenance_snapshots(user_id, calculated_date);

CREATE TABLE daily_goal_definitions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  goal_type TEXT NOT NULL,
  minutes INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX daily_goal_definitions_user_active_N1
  ON daily_goal_definitions(user_id, active, sort_order);

CREATE UNIQUE INDEX daily_goal_definitions_user_type_U1
  ON daily_goal_definitions(user_id, goal_type);

CREATE TABLE daily_goal_completions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id) REFERENCES daily_goal_definitions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX daily_goal_completions_U1
  ON daily_goal_completions(user_id, goal_id, entry_date);
