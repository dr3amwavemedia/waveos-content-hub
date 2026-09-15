-- Draft contracts store the editable field values and source wording used
-- to produce their immutable client-specific text. Existing links are unchanged.
ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS contract_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_contracts
  ADD CONSTRAINT client_contracts_contract_data_object
  CHECK (jsonb_typeof(contract_data) = 'object');
