-- Reusable fixed-price photography agreement requested for the contract picker.
insert into public.document_templates (kind, name, description, body, is_active)
select
  'contract',
  'Photography Services Agreement',
  'Two-hour branding photography agreement totaling $1,450.18, including retouching, expedited delivery, and studio rental.',
  jsonb_build_object(
    'title', 'Photography Services Agreement',
    'content', $contract$
PHOTOGRAPHY SERVICES AGREEMENT

Agreement date: {{today_date}}

This Photography Services Agreement is entered into between Dream Wave Media LLC (“Photographer”) and {{client_legal_name}}, on behalf of {{client_business_name}} (“Client”).

Shoot Date: {{shoot_date}}
Shoot Location: {{shoot_location}}
Scheduled Time: {{scheduled_time}}

1. PROJECT SCOPE

Dream Wave Media will provide photography services for {{client_business_name}}’s branding session featuring a combination of:

- Professional brand and lifestyle photography
- Professional headshots
- Up to two hours of photography coverage
- Professional retouching of the agreed-upon final image selections
- Expedited digital delivery within 1–3 days after the Client’s final selections are confirmed

2. PROJECT FEES

- Photography coverage: 2 hours at $375 per hour — $750.00
- Professional retouching — $175.00
- Expedited 1–3 day delivery — $200.00
- Studio rental — $325.18

Total Project Cost: $1,450.18

Payment is due according to the accompanying invoice. Final images will not be released until all required payments have been received.

3. IMAGE SELECTION AND DELIVERY

Dream Wave Media will provide the Client with a selection process for choosing the final images to be professionally retouched. The number of final retouched images will be confirmed in writing before editing begins.

The expedited delivery period begins after the Client submits their final selections and all required payments have been received.

4. CLIENT RESPONSIBILITIES

The Client agrees to arrive on time and prepared for the scheduled session. Time lost because of late arrival, wardrobe preparation, makeup, or other Client-related delays will count toward the scheduled two-hour session.

Additional photography time must be approved by both parties and may result in additional charges.

5. RESCHEDULING AND CANCELLATION

Rescheduling is subject to photographer and studio availability. Any studio rental charges that are nonrefundable or have already been committed remain the Client’s responsibility.

Cancellation terms or refunds will be handled according to the accompanying invoice and any applicable studio policies.

6. USAGE RIGHTS

After full payment, {{client_business_name}} may use the delivered images for its website, social media, advertising, marketing, promotional materials, and other business-related purposes.

Dream Wave Media retains the copyright to the photographs. Dream Wave Media will only use the final images for its portfolio, website, social media, or promotional purposes with {{client_business_name}}’s approval.

7. CREATIVE CONTROL

The Client acknowledges Dream Wave Media’s creative style and grants the Photographer reasonable creative control over lighting, composition, posing, image selection, editing, and final presentation.

8. LIMITATION OF LIABILITY

If Dream Wave Media is unable to complete the services because of illness, equipment failure, emergency, or circumstances beyond its reasonable control, liability will be limited to the amount paid by the Client for any services that were not completed.

9. ACCEPTANCE

By signing below, both parties acknowledge that they have reviewed and accepted the scope, pricing, and terms of this agreement.

Dream Wave Media signer: {{dwm_signer_name}}, {{dwm_signer_title}}
Client signer: {{signer_name}}
Client signer title: {{signer_title}}
Client signer email: {{signer_email}}
$contract$
  ),
  true
where not exists (
  select 1
  from public.document_templates
  where kind = 'contract' and name = 'Photography Services Agreement'
);
