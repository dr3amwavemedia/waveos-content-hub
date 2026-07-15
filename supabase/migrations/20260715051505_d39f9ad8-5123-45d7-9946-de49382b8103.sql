
-- ============ SEED INTERNAL WORKSPACE ============
INSERT INTO public.workspaces (id, name, slug, industry, timezone, is_demo)
VALUES ('11111111-1111-1111-1111-111111111111', 'Dream Wave Media', 'dream-wave-media', 'Agency', 'America/New_York', false)
ON CONFLICT (id) DO NOTHING;

-- ============ BOOTSTRAP OWNER TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_owner BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'dream_wave_owner')
    INTO _has_owner;

  IF NOT _has_owner THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'dream_wave_owner')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES ('11111111-1111-1111-1111-111111111111', NEW.id, 'owner')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============ MEDIA FOLDERS ============
CREATE TABLE public.media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_folder_id UUID REFERENCES public.media_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO authenticated;
GRANT ALL ON public.media_folders TO service_role;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view folders"
  ON public.media_folders FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members insert folders"
  ON public.media_folders FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members update folders"
  ON public.media_folders FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members delete folders"
  ON public.media_folders FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER update_media_folders_updated_at
  BEFORE UPDATE ON public.media_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_media_folders_workspace ON public.media_folders(workspace_id);
CREATE INDEX idx_media_folders_parent ON public.media_folders(parent_folder_id);

-- ============ MEDIA ASSETS ============
CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.media_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC,
  tags TEXT[] NOT NULL DEFAULT '{}',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members view assets"
  ON public.media_assets FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members insert assets"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members update assets"
  ON public.media_assets FOR UPDATE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));
CREATE POLICY "workspace members delete assets"
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_media_assets_workspace ON public.media_assets(workspace_id);
CREATE INDEX idx_media_assets_folder ON public.media_assets(folder_id);
CREATE INDEX idx_media_assets_tags ON public.media_assets USING GIN(tags);

-- ============ INVITE TOKEN LOOKUP + ACCEPT ============
CREATE POLICY "Invitees can view unclaimed invites"
  ON public.invites FOR SELECT TO authenticated
  USING (accepted_at IS NULL AND expires_at > now());

CREATE OR REPLACE FUNCTION public.accept_invite(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _invite public.invites%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _invite FROM public.invites WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF _invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite_already_used'; END IF;
  IF _invite.expires_at < now() THEN RAISE EXCEPTION 'invite_expired'; END IF;

  IF _invite.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES (_invite.workspace_id, _uid, _invite.workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (_uid, _invite.app_role)
    ON CONFLICT DO NOTHING;

  UPDATE public.invites SET accepted_at = now() WHERE id = _invite.id;

  RETURN _invite.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;

-- ============ STORAGE POLICIES (media bucket) ============
CREATE POLICY "media: workspace members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (
    public.is_dream_wave_staff(auth.uid())
    OR public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  ));
CREATE POLICY "media: workspace members upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (
    public.is_dream_wave_staff(auth.uid())
    OR public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  ));
CREATE POLICY "media: workspace members update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (
    public.is_dream_wave_staff(auth.uid())
    OR public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  ));
CREATE POLICY "media: workspace members delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (
    public.is_dream_wave_staff(auth.uid())
    OR public.is_workspace_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  ));
