-- Additive owner-only payment books. Apply only to an isolated test backend.
create table public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe', 'bloom_csv', 'invoice_backfill')),
  external_id text not null check (length(trim(external_id)) > 0),
  import_batch_id uuid,
  invoice_id uuid references public.client_invoices(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  kind text not null check (kind in ('payment', 'refund', 'invoice', 'expense')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  description text,
  status text not null default 'posted' check (status in ('posted', 'unmatched')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index payment_ledger_occurred_idx on public.payment_ledger (occurred_at desc);
create index payment_ledger_invoice_idx on public.payment_ledger (invoice_id);
create index payment_ledger_batch_idx on public.payment_ledger (import_batch_id);

alter table public.payment_ledger enable row level security;
grant select, insert on public.payment_ledger to authenticated;
grant update (status) on public.payment_ledger to authenticated;
grant all on public.payment_ledger to service_role;
create policy "Owners read payment books" on public.payment_ledger
  for select to authenticated
  using (public.has_role((select auth.uid()), 'dream_wave_owner'));
create policy "Owners import Bloom records" on public.payment_ledger
  for insert to authenticated
  with check (
    public.has_role((select auth.uid()), 'dream_wave_owner')
    and source = 'bloom_csv'
    and created_by = (select auth.uid())
  );
create policy "Owners review pending records" on public.payment_ledger
  for update to authenticated
  using (public.has_role((select auth.uid()), 'dream_wave_owner') and source in ('bloom_csv', 'stripe'))
  with check (public.has_role((select auth.uid()), 'dream_wave_owner') and source in ('bloom_csv', 'stripe'));

-- Dateable paid invoices that predate the ledger. Partial manual payments without
-- a paid_at timestamp cannot be assigned to a day and are intentionally omitted.
insert into public.payment_ledger
  (source, external_id, invoice_id, workspace_id, kind, amount_cents, currency, occurred_at, description)
select 'invoice_backfill', ci.id::text, ci.id, ci.workspace_id, 'payment',
       ci.amount_paid_cents, upper(ci.currency), ci.paid_at,
       'Paid invoice before payment ledger'
from public.client_invoices ci
where ci.status = 'paid' and ci.paid_at is not null and ci.amount_paid_cents > 0
on conflict (source, external_id) do nothing;