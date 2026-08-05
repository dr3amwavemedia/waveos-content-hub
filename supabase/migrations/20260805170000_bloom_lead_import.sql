-- Transactional Bloom CSV lead import after client-side header normalization.

CREATE OR REPLACE FUNCTION public.crm_import_bloom_leads(_leads jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _actor uuid := (select auth.uid());
  _lead jsonb;
  _account_id uuid;
  _email text;
  _imported integer := 0;
  _skipped integer := 0;
BEGIN
  IF _actor IS NULL OR NOT public.is_dream_wave_staff(_actor) THEN
    RAISE EXCEPTION 'staff_required';
  END IF;
  IF jsonb_typeof(_leads) <> 'array' THEN
    RAISE EXCEPTION 'invalid_import_payload';
  END IF;
  IF jsonb_array_length(_leads) > 2000 THEN
    RAISE EXCEPTION 'import_limit_exceeded';
  END IF;

  FOR _lead IN SELECT value FROM jsonb_array_elements(_leads)
  LOOP
    _email := nullif(lower(btrim(_lead->>'email')), '');

    IF _email IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.crm_accounts WHERE lower(email) = _email)
      OR EXISTS (SELECT 1 FROM public.crm_contacts WHERE lower(email) = _email)
    ) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.crm_accounts (
      business_name, email, phone, website, city, state, industry,
      lead_source, interested_services, estimated_value_cents, created_by
    ) VALUES (
      left(btrim(_lead->>'businessName'), 160),
      _email,
      nullif(btrim(_lead->>'phone'), ''),
      nullif(btrim(_lead->>'website'), ''),
      nullif(btrim(_lead->>'city'), ''),
      nullif(btrim(_lead->>'state'), ''),
      nullif(btrim(_lead->>'industry'), ''),
      coalesce(nullif(btrim(_lead->>'leadSource'), ''), 'Bloom CSV'),
      CASE
        WHEN jsonb_typeof(_lead->'interestedServices') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(_lead->'interestedServices'))
        ELSE ARRAY[]::text[]
      END,
      CASE
        WHEN jsonb_typeof(_lead->'estimatedValueCents') = 'number'
          THEN greatest(0, (_lead->>'estimatedValueCents')::integer)
        ELSE NULL
      END,
      _actor
    ) RETURNING id INTO _account_id;

    INSERT INTO public.crm_contacts (
      account_id, first_name, last_name, email, phone, is_primary, created_by
    ) VALUES (
      _account_id,
      left(coalesce(nullif(btrim(_lead->>'firstName'), ''), 'Contact'), 80),
      nullif(left(btrim(_lead->>'lastName'), 120), ''),
      _email,
      nullif(btrim(_lead->>'phone'), ''),
      true,
      _actor
    );

    IF nullif(btrim(_lead->>'notes'), '') IS NOT NULL THEN
      INSERT INTO public.crm_notes (account_id, body, author_id)
      VALUES (_account_id, left(btrim(_lead->>'notes'), 10000), _actor);
    END IF;

    _imported := _imported + 1;
  END LOOP;

  RETURN jsonb_build_object('imported', _imported, 'skipped', _skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_import_bloom_leads(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_import_bloom_leads(jsonb) TO authenticated;
