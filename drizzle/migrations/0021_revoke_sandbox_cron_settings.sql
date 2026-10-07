DROP POLICY IF EXISTS "sandbox writes cron settings" ON private.cron_settings;
REVOKE ALL ON private.cron_settings FROM sandbox_exec;
REVOKE ALL ON SCHEMA private FROM sandbox_exec;