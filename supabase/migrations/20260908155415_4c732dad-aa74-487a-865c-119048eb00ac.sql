DROP POLICY IF EXISTS "Dream Wave staff can manage invites" ON public.invites;

CREATE POLICY "Staff can view invites"
ON public.invites FOR SELECT TO authenticated
USING (public.is_dream_wave_staff(auth.uid()));

CREATE POLICY "Staff can create non-privileged invites"
ON public.invites FOR INSERT TO authenticated
WITH CHECK (
  public.is_dream_wave_staff(auth.uid())
  AND (
    public.has_role(auth.uid(), 'dream_wave_owner')
    OR (
      app_role NOT IN ('dream_wave_owner', 'dream_wave_team')
      AND workspace_role <> 'owner'
      AND staff_type IS NULL
      AND workspace_id IS NOT NULL
    )
  )
);

CREATE POLICY "Staff can update non-privileged invites"
ON public.invites FOR UPDATE TO authenticated
USING (
  public.is_dream_wave_staff(auth.uid())
  AND (
    public.has_role(auth.uid(), 'dream_wave_owner')
    OR (
      app_role NOT IN ('dream_wave_owner', 'dream_wave_team')
      AND workspace_role <> 'owner'
      AND staff_type IS NULL
    )
  )
)
WITH CHECK (
  public.is_dream_wave_staff(auth.uid())
  AND (
    public.has_role(auth.uid(), 'dream_wave_owner')
    OR (
      app_role NOT IN ('dream_wave_owner', 'dream_wave_team')
      AND workspace_role <> 'owner'
      AND staff_type IS NULL
    )
  )
);

CREATE POLICY "Staff can delete non-privileged invites"
ON public.invites FOR DELETE TO authenticated
USING (
  public.is_dream_wave_staff(auth.uid())
  AND (
    public.has_role(auth.uid(), 'dream_wave_owner')
    OR (
      app_role NOT IN ('dream_wave_owner', 'dream_wave_team')
      AND workspace_role <> 'owner'
      AND staff_type IS NULL
    )
  )
);