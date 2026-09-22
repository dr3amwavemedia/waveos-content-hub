-- Defense in depth: these tables hold OAuth tokens, signed-contract evidence and
-- the shared invoice counter. They are reached only through server-side code
-- running as service_role. Make the closed state explicit so a future default
-- grant cannot silently expose them.

revoke all on public.contract_signature_archive from anon, authenticated;
revoke all on public.external_media_connections from anon, authenticated;
revoke all on public.external_media_oauth_states from anon, authenticated;
revoke all on public.frameio_service_connections from anon, authenticated;
revoke all on public.global_invoice_number_counter from anon, authenticated;

grant all on public.contract_signature_archive to service_role;
grant all on public.external_media_connections to service_role;
grant all on public.external_media_oauth_states to service_role;
grant all on public.frameio_service_connections to service_role;
grant all on public.global_invoice_number_counter to service_role;

alter table public.contract_signature_archive enable row level security;
alter table public.external_media_connections enable row level security;
alter table public.external_media_oauth_states enable row level security;
alter table public.frameio_service_connections enable row level security;
alter table public.global_invoice_number_counter enable row level security;

alter table public.contract_signature_archive force row level security;
alter table public.external_media_connections force row level security;
alter table public.external_media_oauth_states force row level security;
alter table public.frameio_service_connections force row level security;
alter table public.global_invoice_number_counter force row level security;