CREATE OR REPLACE FUNCTION public.freeze_signed_contract_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL OR OLD.status = 'signed' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.contract_data IS DISTINCT FROM OLD.contract_data
      OR NEW.source_template_id IS DISTINCT FROM OLD.source_template_id
      OR NEW.source_template_version IS DISTINCT FROM OLD.source_template_version
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.signer_name IS DISTINCT FROM OLD.signer_name
      OR NEW.signer_email IS DISTINCT FROM OLD.signer_email
      OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
      OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Signed agreement scope and value are frozen. Create a revised agreement or change order instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER freeze_signed_contract_scope
BEFORE UPDATE ON public.client_contracts
FOR EACH ROW EXECUTE FUNCTION public.freeze_signed_contract_scope();