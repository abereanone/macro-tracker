CREATE TABLE label_scans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  photo_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  neurons REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX label_scans_user_created_N1
  ON label_scans(user_id, created_at);
