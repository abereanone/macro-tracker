CREATE TABLE friend_invites (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  invitee_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX friend_invites_invitee_status_N1
  ON friend_invites(invitee_email, status, expires_at);

CREATE INDEX friend_invites_inviter_status_N1
  ON friend_invites(inviter_user_id, status, created_at);

CREATE TABLE friend_access (
  id TEXT PRIMARY KEY,
  viewer_user_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  invite_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invite_id) REFERENCES friend_invites(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX friend_access_viewer_owner_U1
  ON friend_access(viewer_user_id, owner_user_id);

CREATE INDEX friend_access_owner_N1
  ON friend_access(owner_user_id);
