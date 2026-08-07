-- Staff identity management and staff-forward directory helpers.

create or replace function public.get_staff_forward_directory()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.app_role,
  staff_type text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    ur.user_id,
    au.email::text,
    p.first_name,
    p.last_name,
    ur.role,
    ur.staff_type::text
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  left join public.profiles p on p.id = ur.user_id
  where ur.role in ('dream_wave_owner'::public.app_role, 'dream_wave_team'::public.app_role)
    and exists (
      select 1
      from public.user_roles me
      where me.user_id = auth.uid()
        and me.role in ('dream_wave_owner'::public.app_role, 'dream_wave_team'::public.app_role)
    )
  order by coalesce(p.first_name, ''), coalesce(p.last_name, ''), au.email;
$$;

grant execute on function public.get_staff_forward_directory() to authenticated;

create or replace function public.admin_update_staff_name(
  _target_user uuid,
  _first_name text,
  _last_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'dream_wave_owner'::public.app_role
  ) then
    raise exception 'admin_required';
  end if;

  if nullif(trim(_first_name), '') is null then
    raise exception 'first_name_required';
  end if;

  insert into public.profiles (id, first_name, last_name)
  values (_target_user, trim(_first_name), nullif(trim(coalesce(_last_name, '')), ''))
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        updated_at = now();
end;
$$;

grant execute on function public.admin_update_staff_name(uuid, text, text) to authenticated;

create or replace function public.admin_update_workspace_name(
  _workspace_id uuid,
  _name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'dream_wave_owner'::public.app_role
  ) then
    raise exception 'admin_required';
  end if;

  if nullif(trim(_name), '') is null then
    raise exception 'name_required';
  end if;

  update public.workspaces
  set name = trim(_name)
  where id = _workspace_id;
end;
$$;

grant execute on function public.admin_update_workspace_name(uuid, text) to authenticated;

create or replace function public.admin_update_crm_identity(
  _account_id uuid,
  _business_name text,
  _contact_id uuid default null,
  _first_name text default null,
  _last_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'dream_wave_owner'::public.app_role
  ) then
    raise exception 'admin_required';
  end if;

  if nullif(trim(_business_name), '') is null then
    raise exception 'business_name_required';
  end if;

  update public.crm_accounts
  set business_name = trim(_business_name), updated_at = now(), updated_by = auth.uid()
  where id = _account_id;

  if _contact_id is not null and nullif(trim(coalesce(_first_name, '')), '') is not null then
    update public.crm_contacts
    set first_name = trim(_first_name),
        last_name = nullif(trim(coalesce(_last_name, '')), ''),
        updated_at = now()
    where id = _contact_id and account_id = _account_id;
  end if;
end;
$$;

grant execute on function public.admin_update_crm_identity(uuid, text, uuid, text, text) to authenticated;
