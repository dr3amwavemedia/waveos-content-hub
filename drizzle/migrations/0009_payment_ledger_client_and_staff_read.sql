-- Let clients see their own posted payment history, and staff see the workspaces they manage.
GRANT SELECT ON public.payment_ledger TO authenticated;

DROP POLICY IF EXISTS "Workspace members read their payments" ON public.payment_ledger;
CREATE POLICY "Workspace members read their payments"
ON public.payment_ledger
FOR SELECT
TO authenticated
USING (
  status = 'posted'
  AND workspace_id IS NOT NULL
  AND public.is_workspace_member((SELECT auth.uid()), workspace_id)
);

DROP POLICY IF EXISTS "Dream Wave staff read payments" ON public.payment_ledger;
CREATE POLICY "Dream Wave staff read payments"
ON public.payment_ledger
FOR SELECT
TO authenticated
USING (public.is_dream_wave_staff((SELECT auth.uid())));
