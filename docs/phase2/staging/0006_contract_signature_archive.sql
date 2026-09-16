-- STAGING ONLY — deliberately NOT applied to the shared production backend.
-- Apply this in the isolated staging project's SQL editor, together with the
-- private storage bucket `contract-archive` (see ../staging-isolation.md).
--
-- Additive only: no existing column, constraint, policy or row is changed.

-- 1. Private archive of completed signature documents ------------------------
create table if not exists public.contract_signature_archive (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.client_contracts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'signwell',
  provider_document_id text not null,
  -- immutable snapshot identity
  template_version integer,
  contract_data jsonb not null default '{}'::jsonb,
  rendered_text text,
  -- evidence
  storage_path text not null,
  content_hash text not null,
  byte_size bigint,
  audit_evidence jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_document_id)
);

create index if not exists contract_signature_archive_contract_idx
  on public.contract_signature_archive (contract_id);
create index if not exists contract_signature_archive_workspace_idx
  on public.contract_signature_archive (workspace_id);

alter table public.contract_signature_archive enable row level security;

-- Reads only; every write is server-side through the verified webhook.
grant select on public.contract_signature_archive to authenticated;
grant all on public.contract_signature_archive to service_role;

create policy "Assigned client reads own signed archive"
  on public.contract_signature_archive
  for select to authenticated
  using (public.is_workspace_member((select auth.uid()), workspace_id));

create policy "Dream Wave staff read signed archive"
  on public.contract_signature_archive
  for select to authenticated
  using (public.is_dream_wave_staff((select auth.uid())));

-- Archive rows are evidence: never rewritten, never deleted from the app.
create or replace function public.contract_archive_is_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Signed contract archive records cannot be changed.';
end;
$$;

drop trigger if exists contract_signature_archive_immutable on public.contract_signature_archive;
create trigger contract_signature_archive_immutable
  before update or delete on public.contract_signature_archive
  for each row execute function public.contract_archive_is_immutable();

-- 2. A published agreement's wording and values are frozen -------------------
-- Editing the client profile, project or invoice later cannot rewrite it.
create or replace function public.client_contracts_freeze_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.published_at is null then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.contract_data is distinct from old.contract_data
     or new.source_template_id is distinct from old.source_template_id
     or new.source_template_version is distinct from old.source_template_version
     or new.published_at is distinct from old.published_at then
    raise exception 'This contract is published. Its wording and values are locked; create a new revision instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists client_contracts_freeze_published on public.client_contracts;
create trigger client_contracts_freeze_published
  before update on public.client_contracts
  for each row execute function public.client_contracts_freeze_published();

-- 3. Private storage bucket (run once in the staging project) ----------------
insert into storage.buckets (id, name, public)
values ('contract-archive', 'contract-archive', false)
on conflict (id) do nothing;
-- No storage RLS policies are added on purpose: reads happen only through
-- short-lived service-role signed URLs issued after an authorization check.
