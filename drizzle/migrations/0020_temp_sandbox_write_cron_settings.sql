GRANT USAGE ON SCHEMA private TO sandbox_exec;
GRANT INSERT, UPDATE, SELECT (name) ON private.cron_settings TO sandbox_exec;
CREATE POLICY "sandbox writes cron settings" ON private.cron_settings FOR ALL TO sandbox_exec USING (true) WITH CHECK (true);