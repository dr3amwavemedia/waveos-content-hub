-- Invoices are financial records. Every client tier may view its own workspace
-- invoices, but Dream Wave social managers and other non-owner staff must not
-- see them while managing a client account. Dream Wave owners retain full
-- invoice administration access.

DROP POLICY IF EXISTS "Members view invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Staff manage invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Client members view their invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners create invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners update invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Dream Wave owners delete invoices" ON public.client_invoices;

CREATE POLICY "Client members view their invoices"
  ON public.client_invoices
  FOR SELECT
  TO authenticated
  USING (
    (
      NOT public.is_dream_wave_staff((SELECT auth.uid()))
      AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
    )
    OR public.has_role((SELECT auth.uid()), 'dream_wave_owner')
  );

CREATE POLICY "Dream Wave owners create invoices"
  ON public.client_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners update invoices"
  ON public.client_invoices
  FOR UPDATE
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));

CREATE POLICY "Dream Wave owners delete invoices"
  ON public.client_invoices
  FOR DELETE
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'dream_wave_owner'));
