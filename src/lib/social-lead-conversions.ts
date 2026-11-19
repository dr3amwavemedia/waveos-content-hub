import { z } from "zod";

export const confirmedLeadInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  crmContactId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
  post: z
    .object({
      platform: z.string().min(1).max(40),
      providerAccountId: z.string().min(1).max(200),
      providerPostId: z.string().min(1).max(300),
    })
    .optional(),
});

/** One person = one key: CRM contact id, else normalized email, else phone digits. */
export function confirmedLeadDedupeKey(input: { crmContactId?: string | null; email?: string | null; phone?: string | null }) {
  const crm = input.crmContactId?.trim();
  if (crm) return `crm:${crm}`;
  const email = input.email?.trim().toLowerCase();
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return `email:${email}`;
  const phone = input.phone?.replace(/\D/g, "");
  if (phone && phone.length >= 7) return `phone:${phone}`;
  return null;
}

export function normalizeConfirmedLead(input: z.infer<typeof confirmedLeadInput>, userId: string) {
  const dedupeKey = confirmedLeadDedupeKey(input);
  if (!dedupeKey) return null;
  return {
    workspace_id: input.workspaceId,
    dedupe_key: dedupeKey,
    source: "manual" as const,
    crm_contact_id: input.crmContactId ?? null,
    provider: input.post ? "zernio" : null,
    platform: input.post?.platform ?? null,
    provider_account_id: input.post?.providerAccountId ?? null,
    provider_post_id: input.post?.providerPostId ?? null,
    confirmed_by: userId,
    metadata: { ...(input.name ? { name: input.name } : {}), ...(input.note ? { note: input.note } : {}) },
  };
}
