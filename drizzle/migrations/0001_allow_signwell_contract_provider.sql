ALTER TABLE public.client_contracts DROP CONSTRAINT IF EXISTS client_contracts_provider_check;
ALTER TABLE public.client_contracts
  ADD CONSTRAINT client_contracts_provider_check
  CHECK (provider = ANY (ARRAY['bloom'::text, 'signwell'::text, 'other'::text]));