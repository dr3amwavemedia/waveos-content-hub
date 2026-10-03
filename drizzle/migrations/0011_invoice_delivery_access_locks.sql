ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS delivery_lock_enabled boolean;

UPDATE public.client_invoices
SET delivery_lock_enabled = false
WHERE delivery_lock_enabled IS NULL;

ALTER TABLE public.client_invoices
  ALTER COLUMN delivery_lock_enabled SET DEFAULT true,
  ALTER COLUMN delivery_lock_enabled SET NOT NULL;

COMMENT ON COLUMN public.client_invoices.delivery_lock_enabled IS
  'When enabled, deliveries created or revised while this invoice is outstanding remain client-hidden until it is paid.';

CREATE TABLE IF NOT EXISTS public.invoice_delivery_locks (
  invoice_id uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.client_deliveries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS invoice_delivery_locks_delivery_idx
  ON public.invoice_delivery_locks(delivery_id);

REVOKE ALL ON public.invoice_delivery_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_delivery_locks TO service_role;
ALTER TABLE public.invoice_delivery_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.attach_outstanding_invoice_locks(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _workspace_id uuid;
  _inserted integer := 0;
BEGIN
  SELECT workspace_id INTO _workspace_id
  FROM public.client_deliveries
  WHERE id = _delivery_id;

  IF _workspace_id IS NULL THEN
    RAISE EXCEPTION 'delivery_not_found';
  END IF;

  INSERT INTO public.invoice_delivery_locks(invoice_id, delivery_id)
  SELECT invoice.id, _delivery_id
  FROM public.client_invoices AS invoice
  WHERE invoice.workspace_id = _workspace_id
    AND invoice.delivery_lock_enabled
    AND invoice.status NOT IN ('draft', 'paid', 'void')
  ON CONFLICT (invoice_id, delivery_id) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_outstanding_invoice_locks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_outstanding_invoice_locks(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.capture_delivery_invoice_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.attach_outstanding_invoice_locks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_delivery_invoice_locks ON public.client_deliveries;
CREATE TRIGGER capture_delivery_invoice_locks
  AFTER INSERT OR UPDATE OF title, description, kind, url, delivered_at, is_pinned
  ON public.client_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.capture_delivery_invoice_locks();

CREATE OR REPLACE FUNCTION public.delivery_access_unlocked(_delivery_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.invoice_delivery_locks AS delivery_lock
    JOIN public.client_invoices AS invoice ON invoice.id = delivery_lock.invoice_id
    WHERE delivery_lock.delivery_id = _delivery_id
      AND invoice.delivery_lock_enabled
      AND invoice.status NOT IN ('paid', 'void')
  );
$$;

REVOKE ALL ON FUNCTION public.delivery_access_unlocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_access_unlocked(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members view deliveries" ON public.client_deliveries;
CREATE POLICY "Members view unlocked deliveries"
  ON public.client_deliveries FOR SELECT TO authenticated
  USING (
    public.is_dream_wave_staff((SELECT auth.uid()))
    OR (
      public.is_workspace_member((SELECT auth.uid()), workspace_id)
      AND public.delivery_access_unlocked(id)
    )
  );

CREATE OR REPLACE FUNCTION public.notify_delivery_revisions_updated(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _delivery public.client_deliveries%ROWTYPE;
  _member record;
  _sent integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_role(_uid, 'dream_wave_owner') THEN
    RAISE EXCEPTION 'owner_required';
  END IF;

  SELECT * INTO _delivery
  FROM public.client_deliveries
  WHERE id = _delivery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_not_found';
  END IF;

  PERFORM public.attach_outstanding_invoice_locks(_delivery.id);

  IF NOT public.delivery_access_unlocked(_delivery.id) THEN
    INSERT INTO public.activity_logs(
      workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
    ) VALUES (
      _delivery.workspace_id, _uid, 'delivery_revisions_payment_locked',
      'client_delivery', _delivery.id, jsonb_build_object('title', _delivery.title)
    );
    RETURN -1;
  END IF;

  FOR _member IN
    SELECT user_id FROM public.workspace_members WHERE workspace_id = _delivery.workspace_id
  LOOP
    INSERT INTO public.notifications(user_id, workspace_id, kind, title, body, link)
    VALUES (
      _member.user_id, _delivery.workspace_id, 'generic', 'Revisions are updated',
      _delivery.title || ' has updated revisions ready for you to review.', '/home#your-content'
    );
    _sent := _sent + 1;
  END LOOP;

  INSERT INTO public.activity_logs(
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _delivery.workspace_id, _uid, 'delivery_revisions_notified', 'client_delivery',
    _delivery.id, jsonb_build_object('title', _delivery.title, 'recipients', _sent)
  );

  RETURN _sent;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_delivery_revisions_updated(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_delivery_revisions_updated(uuid) TO authenticated;