-- Allow the Dream Wave owner to permanently delete a client workspace.
-- The UI requires the exact workspace name and removes Storage objects first.
-- Workspace-related database rows follow their existing ON DELETE CASCADE rules.
-- A CRM lead is preserved and simply unlinked from the deleted workspace.

create or replace function public.delete_client_workspace(
  _workspace_id uuid,
  _confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _workspace_name text;
  _deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_role(auth.uid(), 'dream_wave_owner'::public.app_role) then
    raise exception 'owner_required';
  end if;

  select name
    into _workspace_name
    from public.workspaces
   where id = _workspace_id
   for update;

  if not found then
    raise exception 'client_not_found';
  end if;

  if _confirmation is distinct from _workspace_name then
    raise exception 'confirmation_name_mismatch';
  end if;

  update public.crm_accounts
     set linked_workspace_id = null,
         updated_at = now(),
         updated_by = auth.uid()
   where linked_workspace_id = _workspace_id;

  delete from public.workspaces
   where id = _workspace_id
   returning id into _deleted_id;

  if _deleted_id is null then
    raise exception 'client_delete_failed';
  end if;

  return _deleted_id;
end;
$$;

revoke all on function public.delete_client_workspace(uuid, text) from public, anon;
grant execute on function public.delete_client_workspace(uuid, text) to authenticated;
