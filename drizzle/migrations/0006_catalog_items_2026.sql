CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  item_type text NOT NULL DEFAULT 'service',
  description text,
  quantity_default integer NOT NULL DEFAULT 1,
  pricing_type text NOT NULL DEFAULT 'fixed',
  currency text NOT NULL DEFAULT 'USD',
  price_cents bigint,
  monthly_price_cents bigint,
  annual_price_cents bigint,
  minimum_price_cents bigint,
  maximum_price_cents bigint,
  unit text,
  price_display text,
  price_note text,
  active boolean NOT NULL DEFAULT true,
  source text,
  import_version text,
  contract_template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;
GRANT ALL ON public.catalog_items TO service_role;

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read catalog items"
  ON public.catalog_items FOR SELECT TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()));

CREATE POLICY "Owners can insert catalog items"
  ON public.catalog_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'::app_role));

CREATE POLICY "Owners can update catalog items"
  ON public.catalog_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'dream_wave_owner'::app_role));

CREATE POLICY "Owners can delete catalog items"
  ON public.catalog_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'dream_wave_owner'::app_role));

CREATE INDEX catalog_items_category_idx ON public.catalog_items (category);
CREATE INDEX catalog_items_active_idx ON public.catalog_items (active);

CREATE TRIGGER catalog_items_touch
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS import_id text;
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_import_id_key
  ON public.document_templates (import_id) WHERE import_id IS NOT NULL;