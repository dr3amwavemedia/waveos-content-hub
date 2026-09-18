-- Reusable agreements requested for the WaveOS contract picker. Contract
-- drafts snapshot this wording, so later template edits never rewrite an
-- agreement that has already been created for a client.

insert into public.document_templates (kind, name, description, body, is_active)
select
  'contract',
  'Campaign Contract',
  'Flexible campaign agreement with project-specific deliverables, schedule, pricing, and usage terms.',
  jsonb_build_object(
    'title', 'Campaign Services Agreement',
    'content', $contract$
CAMPAIGN SERVICES AGREEMENT

Agreement date: {{today_date}}
Agency: {{dwm_legal_name}}
Agency address: {{dwm_street_address}}
Agency contact: {{dwm_email}} · {{dwm_phone}} · {{dwm_website}}

Client: {{client_legal_name}}
Business / trade name: {{client_business_name}}
Client contact: {{signer_name}}
Client email: {{signer_email}}

CAMPAIGN
Campaign name: {{campaign_name}}
Campaign objective: {{campaign_objective}}
Campaign start date: {{campaign_start_date}}
Campaign end date: {{campaign_end_date}}
Primary platforms / placements: {{campaign_platforms}}

SERVICES AND SCOPE
{{campaign_scope}}

DELIVERABLES
{{deliverables}}

PRODUCTION AND APPROVAL SCHEDULE
{{production_schedule}}

CLIENT RESPONSIBILITIES
{{client_responsibilities}}

PROJECT FEE AND PAYMENT TERMS
Project fee: {{project_fee}}
{{payment_terms}}

REVISIONS AND CHANGE REQUESTS
{{revision_terms}}

USAGE RIGHTS
{{usage_rights}}

CANCELLATION OR RESCHEDULING
{{cancellation_terms}}

SIGNATURE
Client signer: {{signer_name}}
Signer title: {{signer_title}}
Signer email: {{signer_email}}
$contract$
  ),
  true
where not exists (
  select 1
  from public.document_templates
  where kind = 'contract' and name = 'Campaign Contract'
);

insert into public.document_templates (kind, name, description, body, is_active)
select
  'contract',
  'Brand Story Contract 1',
  'Brand story production agreement with editable story, interview, production, and delivery details.',
  jsonb_build_object(
    'title', 'Brand Story Production Agreement',
    'content', $contract$
BRAND STORY PRODUCTION AGREEMENT

Agreement date: {{today_date}}
Agency: {{dwm_legal_name}}
Agency address: {{dwm_street_address}}
Agency contact: {{dwm_email}} · {{dwm_phone}} · {{dwm_website}}

Client: {{client_legal_name}}
Business / trade name: {{client_business_name}}
Client contact: {{signer_name}}
Client email: {{signer_email}}

PROJECT
Project name: {{project_name}}
Brand story objective: {{brand_story_objective}}
Production date: {{project_date}}
Production location: {{location}}
Interview participants: {{interview_participants}}

CREATIVE APPROACH AND SCOPE
{{creative_strategy}}

DELIVERABLES
{{deliverables}}

PRODUCTION SCHEDULE
{{production_schedule}}

DELIVERY TIMELINE
{{delivery_timeline}}

PROJECT FEE AND PAYMENT TERMS
Project fee: {{project_fee}}
{{payment_terms}}

REVISIONS
{{revision_terms}}

USAGE RIGHTS
{{usage_rights}}

CANCELLATION OR RESCHEDULING
{{cancellation_terms}}

SIGNATURE
Client signer: {{signer_name}}
Signer title: {{signer_title}}
Signer email: {{signer_email}}
$contract$
  ),
  true
where not exists (
  select 1
  from public.document_templates
  where kind = 'contract' and name = 'Brand Story Contract 1'
);
