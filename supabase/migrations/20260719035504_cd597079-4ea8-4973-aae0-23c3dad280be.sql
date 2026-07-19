-- Restrict raw Ayrshare profile_key exposure: drop member SELECT, keep staff-only.
DROP POLICY IF EXISTS "Workspace members read ayrshare_profiles" ON public.ayrshare_profiles;
DROP POLICY IF EXISTS "ayrshare_profiles_select_members" ON public.ayrshare_profiles;
DROP POLICY IF EXISTS "Members read ayrshare profiles" ON public.ayrshare_profiles;
DROP POLICY IF EXISTS "Members read ayrshare_profiles" ON public.ayrshare_profiles;

-- Ensure a staff-only read policy exists (no-op if already present under this name).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ayrshare_profiles'
      AND policyname = 'Staff read ayrshare_profiles'
  ) THEN
    CREATE POLICY "Staff read ayrshare_profiles" ON public.ayrshare_profiles
      FOR SELECT TO authenticated
      USING (public.is_dream_wave_staff(auth.uid()));
  END IF;
END $$;