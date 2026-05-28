CREATE TABLE help_dismissals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  help_key TEXT NOT NULL,
  dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX help_dismissals_user_key_U1
  ON help_dismissals(user_id, help_key);
