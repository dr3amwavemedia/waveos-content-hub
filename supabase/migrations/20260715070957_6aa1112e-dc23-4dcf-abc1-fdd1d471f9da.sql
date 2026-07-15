
-- ayrshare_profiles: readable by workspace members, writable by staff only
CREATE POLICY "Workspace members can view ayrshare profiles"
  ON public.ayrshare_profiles FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.is_dream_wave_staff(auth.uid()));

CREATE POLICY "Staff can manage ayrshare profiles"
  ON public.ayrshare_profiles FOR ALL TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()))
  WITH CHECK (public.is_dream_wave_staff(auth.uid()));

-- webhook_events: staff-only visibility; writes only via service role (no policy for insert/update by users)
CREATE POLICY "Staff can view webhook events"
  ON public.webhook_events FOR SELECT TO authenticated
  USING (public.is_dream_wave_staff(auth.uid()));
