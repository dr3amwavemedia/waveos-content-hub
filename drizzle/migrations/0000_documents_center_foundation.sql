-- Additive only. No existing rows modified, no columns dropped.

-- 1. Lifecycle + provider fields on existing document tables
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_session_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_flagged_at timestamptz;

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signer_email text,
  ADD COLUMN IF NOT EXISTS provider_document_id text;

-- Backfill published_at for existing non-draft invoices so nothing disappears
UPDATE public.client_invoices SET published_at = COALESCE(published_at, issued_at, created_at)
  WHERE published_at IS NULL AND status <> 'draft';
UPDATE public.client_contracts SET published_at = COALESCE(published_at, sent_at, created_at)
  WHERE published_at IS NULL;

-- 2. Collision-safe invoice numbers
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoice_number_counters TO authenticated;
GRANT ALL ON public.invoice_number_counters TO service_role;
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read invoice counters" ON public.invoice_number_counters;
CREATE POLICY "Staff read invoice counters" ON public.invoice_number_counters
  FOR SELECT TO authenticated USING (public.is_dream_wave_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_invoice_number(_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v integer;
BEGIN
  IF NOT public.is_dream_wave_staff(auth.uid()) THEN
    RAISE EXCEPTION 'staff_required';
  END IF;
  INSERT INTO public.invoice_number_counters (workspace_id, last_value)
  VALUES (_workspace_id, 1)
  ON CONFLICT (workspace_id)
  DO UPDATE SET last_value = public.invoice_number_counters.last_value + 1, updated_at = now()
  RETURNING last_value INTO v;
  RETURN 'DWM-' || to_char(now(), 'YYYY') || '-' || lpad(v::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;

-- 3. Reusable, versioned document templates (staff only)
CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('invoice','contract','form')),
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage document templates" ON public.document_templates;
CREATE POLICY "Staff manage document templates" ON public.document_templates
  FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));

-- 4. Client forms + responses
CREATE TABLE IF NOT EXISTS public.client_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  published_at timestamptz,
  due_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_forms TO authenticated;
GRANT ALL ON public.client_forms TO service_role;
ALTER TABLE public.client_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage client forms" ON public.client_forms;
CREATE POLICY "Staff manage client forms" ON public.client_forms
  FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));
DROP POLICY IF EXISTS "Members read published forms" ON public.client_forms;
CREATE POLICY "Members read published forms" ON public.client_forms
  FOR SELECT TO authenticated
  USING (status <> 'draft' AND public.is_workspace_member(auth.uid(), workspace_id));

CREATE TABLE IF NOT EXISTS public.client_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.client_forms(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  form_version integer NOT NULL DEFAULT 1,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS client_form_responses_once
  ON public.client_form_responses (form_id, submitted_by);
GRANT SELECT, INSERT, UPDATE ON public.client_form_responses TO authenticated;
GRANT ALL ON public.client_form_responses TO service_role;
ALTER TABLE public.client_form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read form responses" ON public.client_form_responses;
CREATE POLICY "Staff read form responses" ON public.client_form_responses
  FOR SELECT TO authenticated USING (public.is_dream_wave_staff(auth.uid()));
DROP POLICY IF EXISTS "Members manage own form responses" ON public.client_form_responses;
CREATE POLICY "Members manage own form responses" ON public.client_form_responses
  FOR ALL TO authenticated
  USING (submitted_by = auth.uid() AND public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (submitted_by = auth.uid() AND public.is_workspace_member(auth.uid(), workspace_id));

-- 5. Expense receipts (private by default)
CREATE TABLE IF NOT EXISTS public.expense_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  vendor text NOT NULL,
  note text,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  spent_on date NOT NULL DEFAULT current_date,
  file_path text,
  shared_with_client boolean NOT NULL DEFAULT false,
  shared_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_receipts TO authenticated;
GRANT ALL ON public.expense_receipts TO service_role;
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage expense receipts" ON public.expense_receipts;
CREATE POLICY "Staff manage expense receipts" ON public.expense_receipts
  FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));
DROP POLICY IF EXISTS "Members read shared receipts" ON public.expense_receipts;
CREATE POLICY "Members read shared receipts" ON public.expense_receipts
  FOR SELECT TO authenticated
  USING (shared_with_client AND public.is_workspace_member(auth.uid(), workspace_id));

-- 6. Payment-controlled delivery holds (owner controlled, server enforced)
CREATE TABLE IF NOT EXISTS public.delivery_payment_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','project','delivery')),
  target_id uuid,
  release_condition text NOT NULL DEFAULT 'paid_in_full'
    CHECK (release_condition IN ('paid_in_full','deposit_paid')),
  is_active boolean NOT NULL DEFAULT true,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hold_target_required CHECK (scope = 'workspace' OR target_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS delivery_payment_holds_ws ON public.delivery_payment_holds (workspace_id) WHERE is_active;
GRANT SELECT ON public.delivery_payment_holds TO authenticated;
GRANT ALL ON public.delivery_payment_holds TO service_role;
ALTER TABLE public.delivery_payment_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage payment holds" ON public.delivery_payment_holds;
CREATE POLICY "Owners manage payment holds" ON public.delivery_payment_holds
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'));
DROP POLICY IF EXISTS "Staff read payment holds" ON public.delivery_payment_holds;
CREATE POLICY "Staff read payment holds" ON public.delivery_payment_holds
  FOR SELECT TO authenticated USING (public.is_dream_wave_staff(auth.uid()));
DROP POLICY IF EXISTS "Members read own workspace holds" ON public.delivery_payment_holds;
CREATE POLICY "Members read own workspace holds" ON public.delivery_payment_holds
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Server-side evaluation of whether deliverables are unlocked
CREATE OR REPLACE FUNCTION public.deliverables_unlocked(_workspace_id uuid, _project_id uuid DEFAULT NULL, _delivery_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.delivery_payment_holds h
    WHERE h.workspace_id = _workspace_id
      AND h.is_active
      AND h.released_at IS NULL
      AND (
        h.scope = 'workspace'
        OR (h.scope = 'project' AND h.target_id = _project_id)
        OR (h.scope = 'delivery' AND h.target_id = _delivery_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.client_invoices i
        WHERE i.workspace_id = h.workspace_id
          AND i.status <> 'void'
          AND i.status <> 'draft'
          AND (
            (h.release_condition = 'paid_in_full' AND i.status = 'paid')
            OR (h.release_condition = 'deposit_paid' AND (i.status = 'paid' OR i.amount_paid_cents > 0))
          )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.deliverables_unlocked(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.deliverables_unlocked(uuid, uuid, uuid) TO authenticated, service_role;

-- updated_at triggers
DROP TRIGGER IF EXISTS document_templates_touch ON public.document_templates;
CREATE TRIGGER document_templates_touch BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS client_forms_touch ON public.client_forms;
CREATE TRIGGER client_forms_touch BEFORE UPDATE ON public.client_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS expense_receipts_touch ON public.expense_receipts;
CREATE TRIGGER expense_receipts_touch BEFORE UPDATE ON public.expense_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS delivery_payment_holds_touch ON public.delivery_payment_holds;
CREATE TRIGGER delivery_payment_holds_touch BEFORE UPDATE ON public.delivery_payment_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
