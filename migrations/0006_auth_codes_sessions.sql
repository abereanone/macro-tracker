CREATE TABLE auth_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_login_codes_email_created_N1 ON auth_login_codes(email, created_at);
CREATE INDEX auth_login_codes_code_hash_N1 ON auth_login_codes(code_hash);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_user_id_N1 ON auth_sessions(user_id);
CREATE INDEX auth_sessions_token_hash_N1 ON auth_sessions(token_hash);
