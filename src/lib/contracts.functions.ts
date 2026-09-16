import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSignwellDocument, signwellTestMode } from "@/lib/signwell.server";
import { businessProfile, businessFooterLine } from "@/lib/business-profile";
import { publicReturnOrigin } from "@/lib/public-origin.server";

/** Any leftover {{token}} must never reach a signer. */
const unresolvedTokens = (text: string) =>
  [...new Set([...text.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((m) => m[1].trim()))].filter(
    (token) => !/^s\d+:(signature|date|text|initials)$/i.test(token),
  );

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function contractHtml(input: { title: string; body: string; clientName: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title>
<style>@page{margin:18mm}body{font:13px/1.6 Georgia,serif;color:#16222b}h1{font-size:22px;margin:0 0 4px}
.meta{color:#5a6a75;font-size:12px;margin-bottom:24px}.body{white-space:pre-wrap}
.sign{margin-top:48px;border-top:1px solid #ccc;padding-top:18px}footer{margin-top:40px;color:#5a6a75;font-size:11px}</style>
</head><body>
<h1>${escapeHtml(input.title)}</h1>
<div class="meta">${escapeHtml(businessProfile.name)} · Prepared for ${escapeHtml(input.clientName)}</div>
<div class="body">${escapeHtml(input.body)}</div>
<div class="sign"><p>Client signature: {{s1:signature}}</p><p>Date: {{s1:date}}</p></div>
<footer>${escapeHtml(businessFooterLine)}</footer>
</body></html>`;
}

/**
 * Send a published contract for electronic signature (SignWell).
 * Staff only. Stays in test mode until SIGNWELL_LIVE_MODE is set at cutover.
 */
export const sendContractForSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isStaff } = await supabase.rpc("is_dream_wave_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Only Dream Wave staff can send contracts for signature.");

    const { data: contract, error } = await supabase
      .from("client_contracts")
      .select("id,workspace_id,title,description,status,signer_name,signer_email,published_at,provider_document_id")
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("Contract not found.");
    if (!contract.published_at) throw new Error("Publish this contract before sending it for signature.");
    if (contract.status === "signed") throw new Error("This contract is already signed.");
    if (!contract.signer_email || !contract.signer_name) {
      throw new Error("Add the signer's name and email before sending.");
    }
    if (contract.provider_document_id) {
      throw new Error("This contract has already been sent for signature.");
    }
    const leftover = unresolvedTokens(`${contract.title} ${contract.description ?? ""}`);
    if (leftover.length) {
      throw new Error(
        `This contract still has unfilled details (${leftover.join(", ")}). Complete them before creating a signing link.`,
      );
    }
    // Validated public address the signer returns to after signing.
    const returnOrigin = publicReturnOrigin();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name,client_name")
      .eq("id", contract.workspace_id)
      .maybeSingle();

    const document = await createSignwellDocument({
      name: contract.title,
      html: contractHtml({
        title: contract.title,
        body: contract.description ?? "",
        clientName: workspace?.client_name ?? workspace?.name ?? contract.signer_name,
      }),
      signerName: contract.signer_name,
      signerEmail: contract.signer_email,
      redirectUrl: `${returnOrigin}/contract-return?contract=${contract.id}`,
      metadata: { contract_id: contract.id, workspace_id: contract.workspace_id },
    });

    const signingUrl =
      document.recipients?.[0]?.embedded_signing_url ?? document.embedded_signing_url ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("client_contracts")
      .update({
        provider: "signwell",
        provider_document_id: document.id,
        status: "sent",
        sent_at: new Date().toISOString(),
        ...(signingUrl && signingUrl.startsWith("https://") ? { hosted_url: signingUrl } : {}),
      })
      .eq("id", contract.id);

    return { documentId: document.id, signingUrl, testMode: signwellTestMode() };
  });
