-- Repair environments where the contract migration was committed to GitHub
-- but was not applied to the Supabase project serving the app.
CREATE TABLE IF NOT EXISTS public.client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 180),
  description text,
  provider text NOT NULL DEFAULT 'bloom' CHECK (provider IN ('bloom','other')),
  hosted_url text NOT NULL CHECK (hosted_url ~ '^https://'),
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft','sent','viewed','signed','declined','expired','void')),
  sent_at timestamptz,
  signed_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_contracts_workspace_idx
  ON public.client_contracts(workspace_id, created_at DESC);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_contracts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contracts TO authenticated;
GRANT ALL ON public.client_contracts TO service_role;

DROP POLICY IF EXISTS "Client members view their contracts" ON public.client_contracts;
CREATE POLICY "Client members view their contracts"
  ON public.client_contracts FOR SELECT TO authenticated
  USING (
    (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND status <> 'draft'
    )
    OR public.has_role((SELECT auth.uid()), 'dream_wave_owner')
  );

DROP POLICY IF EXISTS "Dream Wave owners create contracts" ON public.client_contracts;
CREATE POLICY "Dream Wave owners create contracts"
  ON public.client_contracts FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

DROP POLICY IF EXISTS "Dream Wave owners update contracts" ON public.client_contracts;
CREATE POLICY "Dream Wave owners update contracts"
  ON public.client_contracts FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

DROP POLICY IF EXISTS "Dream Wave owners delete contracts" ON public.client_contracts;
CREATE POLICY "Dream Wave owners delete contracts"
  ON public.client_contracts FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

DROP TRIGGER IF EXISTS update_client_contracts_updated_at ON public.client_contracts;
CREATE TRIGGER update_client_contracts_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
