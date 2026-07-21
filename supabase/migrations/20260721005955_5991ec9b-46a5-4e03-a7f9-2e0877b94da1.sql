
-- Client deliveries: external links to completed work (Google Drive, Dropbox,
-- Frame.io, Notion, Loom, etc.). Shown on the client Overview and in a full
-- Deliveries card. Staff manage; workspace members view.
CREATE TYPE public.delivery_kind AS ENUM (
  'photos', 'videos', 'reels', 'graphics', 'documents', 'link', 'other'
);

CREATE TABLE public.client_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  kind public.delivery_kind NOT NULL DEFAULT 'link',
  url TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_deliveries_title_len CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT client_deliveries_url_len CHECK (char_length(url) BETWEEN 5 AND 2048)
);
CREATE INDEX client_deliveries_workspace_idx
  ON public.client_deliveries(workspace_id, delivered_at DESC);

GRANT SELECT ON public.client_deliveries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_deliveries TO authenticated;
GRANT ALL ON public.client_deliveries TO service_role;

ALTER TABLE public.client_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view deliveries"
  ON public.client_deliveries FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR public.is_dream_wave_staff(auth.uid())
  );
CREATE POLICY "Staff manage deliveries"
  ON public.client_deliveries FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER update_client_deliveries_updated_at
  BEFORE UPDATE ON public.client_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client invoices: simple metadata + hosted URL (Stripe/QuickBooks/PDF).
-- Nothing sensitive is stored server-side beyond the link and status.
CREATE TYPE public.invoice_status AS ENUM (
  'draft', 'sent', 'paid', 'overdue', 'void'
);

CREATE TABLE public.client_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  number TEXT,
  description TEXT,
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.invoice_status NOT NULL DEFAULT 'sent',
  hosted_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_invoices_currency_len CHECK (char_length(currency) = 3),
  CONSTRAINT client_invoices_amount_nonneg CHECK (amount_cents IS NULL OR amount_cents >= 0)
);
CREATE INDEX client_invoices_workspace_idx
  ON public.client_invoices(workspace_id, issued_at DESC);

GRANT SELECT ON public.client_invoices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_invoices TO authenticated;
GRANT ALL ON public.client_invoices TO service_role;

ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view invoices"
  ON public.client_invoices FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(auth.uid(), workspace_id)
    OR public.is_dream_wave_staff(auth.uid())
  );
CREATE POLICY "Staff manage invoices"
  ON public.client_invoices FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));

CREATE TRIGGER update_client_invoices_updated_at
  BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
