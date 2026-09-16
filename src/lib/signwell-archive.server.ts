/**
 * Private archival of a completed SignWell agreement.
 *
 * Runs only from the verified `document_completed` webhook. It stores the final
 * PDF in a private bucket and records the evidence needed to prove what was
 * signed: provider document id, immutable value + template-version snapshot,
 * SHA-256 content hash, byte size, audit trail and completion time.
 *
 * Nothing here is ever logged, emailed, exported or exposed as a permanent URL.
 * Retrieval happens through a short-lived authorized link only.
 */
import { createHash } from "crypto";

const SIGNWELL_API = "https://www.signwell.com/api/v1";
export const CONTRACT_ARCHIVE_BUCKET = "contract-archive";

async function signwellGet(path: string): Promise<Response> {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error("signwell_not_configured");
  return fetch(`${SIGNWELL_API}${path}`, { headers: { "X-Api-Key": key } });
}

export type ArchiveOutcome =
  | { archived: true; storagePath: string; contentHash: string; byteSize: number }
  | { archived: false; reason: string };

/**
 * Fetch, store and record the completed document. Returns a reason instead of
 * throwing so a storage/schema gap can never make us drop a verified webhook.
 */
export async function archiveCompletedContract(input: {
  contractId: string;
  workspaceId: string;
  providerDocumentId: string;
  completedAt: string;
  templateVersion: number | null;
  contractData: unknown;
  renderedText: string | null;
  auditEvidence: Record<string, unknown>;
}): Promise<ArchiveOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existing = await supabaseAdmin
    .from("contract_signature_archive" as never)
    .select("id")
    .eq("provider_document_id", input.providerDocumentId)
    .maybeSingle();
  if (existing.error && existing.error.code === "42P01") {
    return { archived: false, reason: "archive_table_missing" };
  }
  if (existing.data) return { archived: false, reason: "already_archived" };

  const pdf = await signwellGet(
    `/documents/${encodeURIComponent(input.providerDocumentId)}/completed_pdf?audit_page=true`,
  );
  if (!pdf.ok) return { archived: false, reason: `completed_pdf_${pdf.status}` };
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  if (!bytes.byteLength) return { archived: false, reason: "empty_pdf" };

  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${input.workspaceId}/${input.contractId}/${input.providerDocumentId}.pdf`;

  const upload = await supabaseAdmin.storage
    .from(CONTRACT_ARCHIVE_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error && !/exists/i.test(upload.error.message)) {
    return { archived: false, reason: "storage_unavailable" };
  }

  const insert = await supabaseAdmin.from("contract_signature_archive" as never).insert({
    contract_id: input.contractId,
    workspace_id: input.workspaceId,
    provider: "signwell",
    provider_document_id: input.providerDocumentId,
    template_version: input.templateVersion,
    contract_data: input.contractData ?? {},
    rendered_text: input.renderedText,
    storage_path: storagePath,
    content_hash: contentHash,
    byte_size: bytes.byteLength,
    audit_evidence: input.auditEvidence,
    completed_at: input.completedAt,
  } as never);
  if (insert.error) return { archived: false, reason: "archive_record_failed" };

  return { archived: true, storagePath, contentHash, byteSize: bytes.byteLength };
}

/** Short-lived authorized download link. Never persisted, never emailed. */
export async function signedArchiveUrl(storagePath: string, seconds = 120) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(CONTRACT_ARCHIVE_BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw new Error("archive_link_unavailable");
  return data.signedUrl;
}
