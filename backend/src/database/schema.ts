/**
 * The schema is kept as a string rather than a .sql file so it ships with the
 * compiled output and runs identically in dev, in CI and in a container. It is
 * idempotent: every statement is IF NOT EXISTS, so boot order does not matter.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY,
  type        TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  user_id     TEXT NOT NULL,
  region      TEXT NOT NULL,
  product     TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The historical view always filters and orders by time, and usually by type.
CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_type_occurred_at_idx ON events (type, occurred_at DESC);
`;
