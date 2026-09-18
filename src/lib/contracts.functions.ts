import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createSignwellDocument,
  getSignwellDocument,
  signwellTestMode,
} from "@/lib/signwell.server";
import { businessProfile, businessFooterLine } from "@/lib/business-profile";
import { publicReturnOrigin } from "@/lib/public-origin.server";

/** Any leftover {{token}} must never reach a signer. */
const unresolvedTokens = (text: string) =>
  [...new Set([...text.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((m) => m[1].trim()))].filter(
    (token) => !/^s\d+:(signature|date|text|initials)$/i.test(token),
  );

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

function validatedSignwellUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const destination = new URL(url);
    if (
      destination.protocol !== "https:" ||
      !/(^|\.)signwell\.com$/i.test(destination.hostname)
    ) {
      return null;
    }
    return destination.toString();
  } catch {
    return null;
  }
}

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
      .select(
        "id,workspace_id,title,description,status,signer_name,signer_email,published_at,provider_document_id",
      )
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("Contract not found.");
    if (!contract.published_at)
      throw new Error("Publish this contract before sending it for signature.");
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

    const signingUrl = validatedSignwellUrl(
      document.recipients?.find(
        (row) => row.email?.toLowerCase() === contract.signer_email!.toLowerCase(),
      )?.embedded_signing_url ??
        document.recipients?.[0]?.embedded_signing_url ??
        document.embedded_signing_url,
    );
    if (!signingUrl) {
      throw new Error("SignWell created the document without a usable embedded signing link.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("client_contracts")
      .update({
        provider: "signwell",
        provider_document_id: document.id,
        status: "sent",
        sent_at: new Date().toISOString(),
        // SignWell returns the embedded signer credential when the document is
        // created, but its later GET response can omit it. Keep the validated
        // URL on the RLS-protected contract row so only authorized members can
        // request it through getContractSigningLink.
        hosted_url: signingUrl,
      })
      .eq("id", contract.id);

    return { documentId: document.id, signingUrl, testMode: signwellTestMode() };
  });

/**
 * Return a fresh SignWell signing destination to an authorized workspace
 * member or owner. The RLS-scoped query and explicit state checks prevent
 * draft, unrelated, completed, or expired contracts from exposing a link.
 */
export const getContractSigningLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: contract, error } = await context.supabase
      .from("client_contracts")
      .select("id,provider,provider_document_id,status,published_at,signer_email,hosted_url")
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("This contract is not available on your account.");
    if (contract.provider !== "signwell" || !contract.provider_document_id) {
      throw new Error("This contract does not have a SignWell signing request.");
    }
    if (!contract.published_at || contract.status === "draft") {
      throw new Error("This contract has not been published for signing.");
    }
    if (["signed", "declined", "expired", "void"].includes(contract.status)) {
      throw new Error("This contract is no longer available for signing.");
    }

    let url = validatedSignwellUrl(contract.hosted_url);
    if (!url) {
      const document = await getSignwellDocument(contract.provider_document_id);
      const recipient =
        document.recipients?.find(
          (row) => row.email?.toLowerCase() === contract.signer_email?.toLowerCase(),
        ) ?? document.recipients?.[0];
      url = validatedSignwellUrl(
        recipient?.embedded_signing_url ?? document.embedded_signing_url,
      );
    }
    if (!url)
      throw new Error(
        "This SignWell request does not have an active signing link. Ask Dream Wave Media to recover or replace this test request.",
      );
    return {
      url,
      returnUrl: `${publicReturnOrigin()}/contract-return?contract=${encodeURIComponent(contract.id)}`,
    };
  });

/**
 * Explicit staff action that makes a finished draft eligible for a signing
 * link. It never contacts the provider and never emails anyone; it only records
 * that an authorized person reviewed the rendered contract.
 */
export const publishContractForSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isStaff } = await supabase.rpc("is_dream_wave_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Only Dream Wave staff can publish contracts.");

    const { data: contract, error } = await supabase
      .from("client_contracts")
      .select("id,title,description,status,signer_name,signer_email,published_at")
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("Contract not found.");
    if (contract.published_at) return { publishedAt: contract.published_at };
    if (contract.status !== "draft") throw new Error("Only a draft contract can be published.");
    if (!contract.signer_name || !contract.signer_email)
      throw new Error("Add the signer's name and email before publishing.");
    const leftover = unresolvedTokens(`${contract.title} ${contract.description ?? ""}`);
    if (leftover.length) throw new Error(`Complete these details first: ${leftover.join(", ")}.`);

    const publishedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("client_contracts")
      .update({ published_at: publishedAt })
      .eq("id", contract.id)
      .is("published_at", null);
    if (updateError) throw updateError;
    return { publishedAt };
  });

/**
 * Authorized read of one contract's signing state, used by the return page.
 * RLS restricts it to the assigned client or Dream Wave staff. Only a verified
 * document_completed webhook ever sets the signed state this reports.
 */
export const getContractSigningState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: contract, error } = await context.supabase
      .from("client_contracts")
      .select("id,title,status,sent_at,signed_at,provider")
      .eq("id", data.contractId)
      .maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("This contract is not available on your account.");
    return {
      id: contract.id,
      title: contract.title,
      status: contract.status,
      provider: contract.provider,
      sentAt: contract.sent_at,
      signedAt: contract.signed_at,
      signed: contract.status === "signed",
      declined: contract.status === "declined" || contract.status === "expired",
    };
  });
