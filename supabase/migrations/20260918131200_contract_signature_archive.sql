-- Private, immutable copies of completed SignWell agreements. The verified
-- webhook writes with the service role; portal users receive only a short-lived
-- signed Storage URL after the contract itself passes RLS.
CREATE TABLE IF NOT EXISTS public.contract_signature_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.client_contracts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'signwell'),
  provider_document_id text NOT NULL UNIQUE,
  template_version integer,
  contract_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  rendered_text text,
  storage_path text NOT NULL UNIQUE,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  audit_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_signature_archive_contract_idx
  ON public.contract_signature_archive(contract_id, completed_at DESC);

ALTER TABLE public.contract_signature_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_signature_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contract_signature_archive TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-archive', 'contract-archive', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
