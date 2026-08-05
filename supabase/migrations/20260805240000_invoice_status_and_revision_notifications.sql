-- Client billing status additions and owner-only revision notifications.
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'deposit';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'unpaid';

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

  FOR _member IN
    SELECT user_id
    FROM public.workspace_members
    WHERE workspace_id = _delivery.workspace_id
  LOOP
    INSERT INTO public.notifications(user_id, workspace_id, kind, title, body, link)
    VALUES (
      _member.user_id,
      _delivery.workspace_id,
      'generic',
      'Revisions are updated',
      _delivery.title || ' has updated revisions ready for you to review.',
      '/home#your-content'
    );
    _sent := _sent + 1;
  END LOOP;

  INSERT INTO public.activity_logs(
    workspace_id, actor_user_id, action, entity_type, entity_id, safe_metadata
  ) VALUES (
    _delivery.workspace_id,
    _uid,
    'delivery_revisions_notified',
    'client_delivery',
    _delivery.id,
    jsonb_build_object('title', _delivery.title, 'recipients', _sent)
  );

  RETURN _sent;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_delivery_revisions_updated(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_delivery_revisions_updated(uuid) TO authenticated;
