CREATE TABLE face_shares (
  code TEXT PRIMARY KEY NOT NULL CHECK (length(code) = 6),
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX face_shares_expiry_idx ON face_shares(expires_at);
