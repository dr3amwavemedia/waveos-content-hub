create table if not exists public.user_experience_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_guide_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_experience_preferences enable row level security;

grant select, insert, update on public.user_experience_preferences to authenticated;
grant all on public.user_experience_preferences to service_role;

drop policy if exists "Users read their experience preferences"
  on public.user_experience_preferences;
create policy "Users read their experience preferences"
  on public.user_experience_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their experience preferences"
  on public.user_experience_preferences;
create policy "Users create their experience preferences"
  on public.user_experience_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their experience preferences"
  on public.user_experience_preferences;
create policy "Users update their experience preferences"
  on public.user_experience_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists update_user_experience_preferences_updated_at
  on public.user_experience_preferences;
create trigger update_user_experience_preferences_updated_at
  before update on public.user_experience_preferences
  for each row execute function public.update_updated_at_column();
