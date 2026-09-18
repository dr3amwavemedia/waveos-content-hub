-- Reusable catalog additions requested for the client contract and invoice flows.
-- The application snapshots template contents into each created document, so
-- later template revisions never rewrite an already-issued contract or invoice.

insert into public.document_templates (kind, name, description, body, is_active)
select
  'invoice',
  'Brand Story Video + Editorial Photos',
  'Brand story video and editorial photo services with standard pricing.',
  jsonb_build_object(
    'title', 'Brand Story Video + Editorial Photos',
    'description', 'Brand content production services',
    'items', jsonb_build_array(
      jsonb_build_object(
        'title', 'Brand Story Video',
        'description', 'Brand story video production',
        'quantity', 1,
        'unitCents', 250000
      ),
      jsonb_build_object(
        'title', 'Editorial Photos',
        'description', 'Editorial photography collection',
        'quantity', 1,
        'unitCents', 30000
      )
    )
  ),
  true
where not exists (
  select 1 from public.document_templates
  where kind = 'invoice' and name = 'Brand Story Video + Editorial Photos'
);

insert into public.document_templates (kind, name, description, body, is_active)
select
  'contract',
  'Brand Story Video + Editorial Photos Agreement',
  'Agreement for the $2,500 brand story video and $300 editorial photo services.',
  jsonb_build_object(
    'title', 'Brand Story Video + Editorial Photos Agreement',
    'content', $contract$
BRAND STORY VIDEO + EDITORIAL PHOTOS AGREEMENT

Agreement date: {{today_date}}
Client: {{client_name}}
Business: {{business_name}}
Project: {{project_name}}
Production date: {{project_date}}
Production location: {{location}}

SERVICES
{{services}}

CREATIVE STRATEGY
{{creative_strategy}}

PRODUCTION SCHEDULE
{{production_schedule}}

DELIVERABLES
{{deliverables}}

DELIVERY TIMELINE
{{delivery_timeline}}

REVISIONS
{{revision_rounds}}

PAYMENT TERMS
{{payment_terms}}

USAGE RIGHTS
{{usage_rights}}

CANCELLATION OR RESCHEDULING
{{cancellation_terms}}

The completed agreement will be reviewed, edited if needed, and sent for signature through SignWell.
$contract$
  ),
  true
where not exists (
  select 1 from public.document_templates
  where kind = 'contract' and name = 'Brand Story Video + Editorial Photos Agreement'
);
