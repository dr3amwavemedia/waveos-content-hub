-- Keep the Layer 5 wedding workspace display name in sync when an owner
-- changes the canonical client/workspace name.
--
-- This intentionally updates only the existing workspace row. It does not
-- touch auth users, workspace memberships, invites, emails, roles, or IDs.

create or replace function public.admin_update_workspace_name(
  _workspace_id uuid,
  _name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean_name text := nullif(trim(_name), '');
begin
  if not exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'dream_wave_owner'::public.app_role
  ) then
    raise exception 'admin_required';
  end if;

  if _clean_name is null then
    raise exception 'name_required';
  end if;

  update public.workspaces
  set
    name = _clean_name,
    wedding_display_name = case
      when access_tier = 'wedding_client'::public.client_access_tier then _clean_name
      else wedding_display_name
    end
  where id = _workspace_id;

  if not found then
    raise exception 'workspace_not_found';
  end if;
end;
$$;

revoke all on function public.admin_update_workspace_name(uuid, text) from public, anon;
grant execute on function public.admin_update_workspace_name(uuid, text) to authenticated;
