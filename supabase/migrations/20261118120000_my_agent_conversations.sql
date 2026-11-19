-- Durable, per-user My Agent conversations shared by WaveOS web and mobile.
-- Messages remain private to their author even when several people share a workspace.

CREATE TABLE IF NOT EXISTS public.my_agent_threads (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation' CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (id, workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.my_agent_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  input_mode text NOT NULL DEFAULT 'text' CHECK (input_mode IN ('text', 'voice')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT my_agent_messages_thread_owner_fk
    FOREIGN KEY (thread_id, workspace_id, user_id)
    REFERENCES public.my_agent_threads(id, workspace_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS my_agent_threads_owner_recent_idx
  ON public.my_agent_threads(user_id, workspace_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS my_agent_messages_thread_order_idx
  ON public.my_agent_messages(thread_id, created_at, id);

ALTER TABLE public.my_agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_agent_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.my_agent_threads FROM PUBLIC, anon;
REVOKE ALL ON public.my_agent_messages FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_agent_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.my_agent_messages TO authenticated;
GRANT ALL ON public.my_agent_threads TO service_role;
GRANT ALL ON public.my_agent_messages TO service_role;

DROP POLICY IF EXISTS "Users read their My Agent threads" ON public.my_agent_threads;
CREATE POLICY "Users read their My Agent threads"
  ON public.my_agent_threads FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users create their My Agent threads" ON public.my_agent_threads;
CREATE POLICY "Users create their My Agent threads"
  ON public.my_agent_threads FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.workspace_members AS members
        WHERE members.workspace_id = my_agent_threads.workspace_id
          AND members.user_id = (SELECT auth.uid())
      )
      OR public.can_staff_manage_workspace((SELECT auth.uid()), workspace_id)
    )
  );

DROP POLICY IF EXISTS "Users update their My Agent threads" ON public.my_agent_threads;
CREATE POLICY "Users update their My Agent threads"
  ON public.my_agent_threads FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users delete their My Agent threads" ON public.my_agent_threads;
CREATE POLICY "Users delete their My Agent threads"
  ON public.my_agent_threads FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users read their My Agent messages" ON public.my_agent_messages;
CREATE POLICY "Users read their My Agent messages"
  ON public.my_agent_messages FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users create their My Agent messages" ON public.my_agent_messages;
CREATE POLICY "Users create their My Agent messages"
  ON public.my_agent_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.my_agent_threads AS threads
      WHERE threads.id = my_agent_messages.thread_id
        AND threads.workspace_id = my_agent_messages.workspace_id
        AND threads.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users update their My Agent messages" ON public.my_agent_messages;
CREATE POLICY "Users update their My Agent messages"
  ON public.my_agent_messages FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users delete their My Agent messages" ON public.my_agent_messages;
CREATE POLICY "Users delete their My Agent messages"
  ON public.my_agent_messages FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

