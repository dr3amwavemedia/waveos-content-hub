create table if not exists public.invoice_autopay_schedules (
  id uuid primary key default gen_random_uuid(),
  source_invoice_id uuid not null unique references public.client_invoices(id) on delete cascade,
  current_invoice_id uuid references public.client_invoices(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'one_time' check (frequency in ('one_time','monthly')),
  charge_at timestamptz not null,
  timezone text not null default 'America/New_York',
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  description text,
  status text not null default 'pending_authorization' check (status in ('disabled','pending_authorization','active','processing','completed','failed','action_required','cancelled')),
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_setup_session_id text,
  stripe_last_payment_intent_id text,
  authorized_at timestamptz,
  last_attempt_at timestamptz,
  last_succeeded_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_autopay_due_idx
  on public.invoice_autopay_schedules(charge_at)
  where enabled and status = 'active';

alter table public.invoice_autopay_schedules enable row level security;
grant select, insert, update, delete on public.invoice_autopay_schedules to authenticated;
grant all on public.invoice_autopay_schedules to service_role;

drop policy if exists "Workspace members view autopay schedules" on public.invoice_autopay_schedules;
create policy "Workspace members view autopay schedules"
  on public.invoice_autopay_schedules for select to authenticated
  using (public.is_workspace_member((select auth.uid()), workspace_id) or public.is_dream_wave_staff((select auth.uid())));

drop policy if exists "Staff manage autopay schedules" on public.invoice_autopay_schedules;
create policy "Staff manage autopay schedules"
  on public.invoice_autopay_schedules for all to authenticated
  using (public.is_dream_wave_staff((select auth.uid())))
  with check (public.is_dream_wave_staff((select auth.uid())));

drop trigger if exists update_invoice_autopay_schedules_updated_at on public.invoice_autopay_schedules;
create trigger update_invoice_autopay_schedules_updated_at
  before update on public.invoice_autopay_schedules
  for each row execute function public.update_updated_at_column();
