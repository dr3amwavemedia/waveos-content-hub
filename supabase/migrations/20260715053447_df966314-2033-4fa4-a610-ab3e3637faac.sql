
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.content_status AS ENUM (
    'draft','in_review','changes_requested','approved','scheduled','publishing','published','failed','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.social_platform AS ENUM (
    'instagram','facebook','tiktok','youtube','linkedin','x','pinterest','threads','bluesky','gmb','snapchat'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.approval_decision AS ENUM ('pending','approved','changes_requested','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.publish_status AS ENUM ('queued','sending','success','partial','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'invite_accepted','content_submitted','content_approved','content_changes_requested','content_rejected',
    'content_published','content_failed','comment_added','account_connected','account_disconnected','generic'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ content_items ============
CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT,
  internal_notes TEXT,
  status public.content_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  first_published_url TEXT,
  primary_caption TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  media_asset_ids UUID[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_items_workspace_idx ON public.content_items(workspace_id, status);
CREATE INDEX IF NOT EXISTS content_items_scheduled_idx ON public.content_items(scheduled_at) WHERE status IN ('scheduled','approved');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read content" ON public.content_items FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "members write content" ON public.content_items FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "members update content" ON public.content_items FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "members delete content" ON public.content_items FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER content_items_updated_at BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ post_variants (per-platform captions) ============
CREATE TABLE IF NOT EXISTS public.post_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  platform_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_variants TO authenticated;
GRANT ALL ON public.post_variants TO service_role;
ALTER TABLE public.post_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access variants" ON public.post_variants FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER post_variants_updated_at BEFORE UPDATE ON public.post_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ approvals ============
CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision public.approval_decision NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members access approvals" ON public.approvals FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER approvals_updated_at BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ comments ============
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read comments" ON public.comments FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "members add comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK ((public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid())) AND author_id = auth.uid());
CREATE POLICY "authors delete comments" ON public.comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_dream_wave_staff(auth.uid()));

-- ============ ayrshare_profiles (server-only key) ============
CREATE TABLE IF NOT EXISTS public.ayrshare_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  profile_title TEXT,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NO authenticated grant — only service_role can read/write
GRANT ALL ON public.ayrshare_profiles TO service_role;
ALTER TABLE public.ayrshare_profiles ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated. RLS on + no policy = zero access from client.

CREATE TRIGGER ayrshare_profiles_updated_at BEFORE UPDATE ON public.ayrshare_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ social_connections (safe metadata only) ============
CREATE TABLE IF NOT EXISTS public.social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  connected BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform)
);
GRANT SELECT ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read connections" ON public.social_connections FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER social_connections_updated_at BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ publish_attempts ============
CREATE TABLE IF NOT EXISTS public.publish_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform public.social_platform NOT NULL,
  status public.publish_status NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  ayrshare_post_id TEXT,
  post_url TEXT,
  error_code TEXT,
  error_message TEXT,
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, platform)
);
CREATE INDEX IF NOT EXISTS publish_attempts_content_idx ON public.publish_attempts(content_item_id);
GRANT SELECT ON public.publish_attempts TO authenticated;
GRANT ALL ON public.publish_attempts TO service_role;
ALTER TABLE public.publish_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read attempts" ON public.publish_attempts FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER publish_attempts_updated_at BEFORE UPDATE ON public.publish_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ notifications ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL DEFAULT 'generic',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, read_at, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ webhook_events (Ayrshare + others) ============
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT,
  external_id TEXT,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- no policies: service-role only

-- ============ helper: create notification (SECURITY DEFINER, safe) ============
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID, _workspace_id UUID, _kind public.notification_kind,
  _title TEXT, _body TEXT DEFAULT NULL, _link TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.notifications(user_id, workspace_id, kind, title, body, link)
    VALUES (_user_id, _workspace_id, _kind, _title, _body, _link)
    RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_notification(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, UUID, public.notification_kind, TEXT, TEXT, TEXT) TO service_role;
