-- Public-app accounts and agency-managed Dream Wave clients are distinct data
-- sources. Existing records remain agency Client data unless explicitly marked.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'client_data'
  CHECK (data_source IN ('client_data', 'os_data'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_source text NOT NULL DEFAULT 'client_data'
  CHECK (account_source IN ('client_data', 'os_data')),
  ADD COLUMN IF NOT EXISTS payments_enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS workspaces_data_source_created_idx
  ON public.workspaces(data_source, created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_account_source_created_idx
  ON public.profiles(account_source, created_at DESC);

-- Only new users that arrive with trusted public-app metadata are OS data.
-- Existing users are intentionally untouched.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, avatar_url, account_source)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN NEW.raw_user_meta_data->>'account_source' = 'os_data'
      THEN 'os_data' ELSE 'client_data' END
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Owner-only support actions are audited. Password reset delivery itself is
-- performed server-side through Supabase Auth; no plaintext password exists.
CREATE OR REPLACE FUNCTION public.admin_set_os_account_payments(
  _user_id uuid, _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'dream_wave_owner') THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND account_source = 'os_data')
    THEN RAISE EXCEPTION 'os_account_not_found'; END IF;
  UPDATE public.profiles SET payments_enabled = _enabled WHERE id = _user_id;
  INSERT INTO public.activity_logs(actor_user_id, action, entity_type, entity_id, safe_metadata)
  VALUES (auth.uid(), 'os_account_payments_changed', 'profile', _user_id,
    jsonb_build_object('payments_enabled', _enabled));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_os_account_payments(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_os_account_payments(uuid, boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS public.os_account_support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('sign_in', 'password_reset', 'account_help')),
  detail text,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS os_account_support_requests_email_created_idx
  ON public.os_account_support_requests(lower(email), created_at DESC);
ALTER TABLE public.os_account_support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_account_support_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.os_account_support_requests TO authenticated;
GRANT ALL ON public.os_account_support_requests TO service_role;
CREATE POLICY "Owners view OS support requests" ON public.os_account_support_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'dream_wave_owner'));
