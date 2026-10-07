CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.cron_settings (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cron_settings FROM PUBLIC, anon, authenticated;
ALTER TABLE private.cron_settings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE private.cron_settings IS 'Server-only values read by scheduled database jobs. Not exposed to the Data API.';