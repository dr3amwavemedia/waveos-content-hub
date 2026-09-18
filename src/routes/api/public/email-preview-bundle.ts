import { Buffer } from "node:buffer";
import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { businessProfile } from "@/lib/business-profile";
import { paymentReceiptEmail, signedContractEmail } from "@/lib/document-completion-email";

const TARGET = "dr3amwavemedia@gmail.com";
const RUN_ID = "client-email-preview-2026-09-18";

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

function layout(heading: string, message: string, label: string, url: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef4f7;font-family:Arial,sans-serif;color:#102535"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:580px;background:#fff;border:1px solid #d7e4ea;border-radius:18px;overflow:hidden"><tr><td style="background:#07597a;padding:24px 28px;color:#fff;font-size:22px;font-weight:700">Dream Wave Media<br><span style="font-size:11px;letter-spacing:2px;color:#bfe9f5">POWERED BY WAVEOS</span></td></tr><tr><td style="padding:34px 28px"><p style="margin:0 0 12px;color:#0a7699;font-size:12px;font-weight:700;letter-spacing:1px">EMAIL PREVIEW — NO PAYMENT OR SIGNATURE RECORDED</p><h1 style="margin:0 0 14px;font-size:25px">${esc(heading)}</h1><p style="font-size:16px;line-height:1.6;color:#405766">${esc(message)}</p><a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#07597a;color:#fff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">${esc(label)} &rarr;</a></td></tr><tr><td align="center" style="background:#f8fbfc;border-top:1px solid #e4edf1;padding:22px 28px;font-size:12px;line-height:1.6;color:#71828d">Dream Wave Media LLC<br>${esc(businessProfile.phone)} &bull; ${esc(businessProfile.email ?? "")}<br>${esc(businessProfile.website.replace(/^https?:\/\//, ""))}</td></tr></table></td></tr></table></body></html>`;
}

async function resend(subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("resend_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.TRANSACTIONAL_EMAIL_FROM ?? "Jean <jean@dwmsrq.com>",
      to: [TARGET],
      subject,
      html,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) throw new Error(result.message ?? `resend_${response.status}`);
  return result.id ?? null;
}

async function sendSignwellPreview() {
  const apiKey = process.env.SIGNWELL_API_KEY;
  if (!apiKey) throw new Error("signwell_not_configured");
  const html = `<!doctype html><html><body style="font:14px/1.6 Georgia,serif"><h1>Photography Services Agreement — Email Preview</h1><p>This test-mode agreement lets Dream Wave Media review the exact SignWell signature-request email and signing experience. It is not legally binding and is not connected to an invoice or client record.</p></body></html>`;
  const response = await fetch("https://www.signwell.com/api/v1/documents", {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      test_mode: true,
      draft: false,
      with_signature_page: true,
      reminders: false,
      name: "Photography Services Agreement — Email Preview",
      subject: "Signature requested: Photography Services Agreement — Email Preview",
      message:
        "This is the test email a client receives after you click Send in SignWell. No real agreement or payment is attached.",
      files: [
        {
          name: "Photography Services Agreement - Email Preview.html",
          file_base64: Buffer.from(html, "utf8").toString("base64"),
        },
      ],
      recipients: [{ id: "1", name: "Dream Wave Media Email Preview", email: TARGET }],
      metadata: { purpose: "waveos_client_email_preview" },
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    errors?: unknown;
  };
  if (!response.ok) throw new Error(result.message ?? `signwell_${response.status}`);
  return result.id ?? null;
}

export const Route = createFileRoute("/api/public/email-preview-bundle")({
  server: {
    handlers: {
      POST: async () => {
        const gate = await supabaseAdmin.from("email_preview_runs" as never).insert({
          id: RUN_ID,
          recipient_email: TARGET,
          status: "running",
        } as never);
        if (gate.error)
          return Response.json({ error: "preview_already_requested" }, { status: 409 });

        const portal = "https://waveos.dreamwavemedia.co/home";
        const receipt = paymentReceiptEmail({
          invoiceNumber: "INV-PREVIEW-001",
          receivedCents: 50000,
          totalPaidCents: 50000,
          balanceCents: 95018,
          currency: "USD",
        });
        const signed = signedContractEmail({
          contractTitle: "Photography Services Agreement — Email Preview",
        });
        const results: Array<{ type: string; id: string | null }> = [];
        try {
          results.push({
            type: "invoice_updated",
            id: await resend(
              "Invoice updated: INV-PREVIEW-001",
              layout(
                "Your invoice was updated",
                "INV-PREVIEW-001 is now sent. This is a preview; no invoice was created.",
                "View invoice",
                `${portal}#invoices`,
              ),
            ),
          });
          results.push({
            type: receipt.eventType,
            id: await resend(
              receipt.subject,
              layout(receipt.heading, receipt.message, receipt.buttonLabel, `${portal}#invoices`),
            ),
          });
          results.push({
            type: "contract_ready",
            id: await resend(
              "Contract ready: Photography Services Agreement — Email Preview",
              layout(
                "Your contract is ready",
                "Photography Services Agreement — Email Preview is ready to view and sign. This preview is not connected to a client record.",
                "View contract",
                `${portal}#contracts`,
              ),
            ),
          });
          results.push({
            type: signed.eventType,
            id: await resend(
              signed.subject,
              layout(signed.heading, signed.message, signed.buttonLabel, `${portal}#contracts`),
            ),
          });
          results.push({ type: "signwell_signature_request", id: await sendSignwellPreview() });
          await supabaseAdmin
            .from("email_preview_runs" as never)
            .update({ status: "sent", completed_at: new Date().toISOString() } as never)
            .eq("id", RUN_ID);
          return Response.json({ sent: results.length, results });
        } catch (error) {
          await supabaseAdmin
            .from("email_preview_runs" as never)
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_message: error instanceof Error ? error.message.slice(0, 500) : "failed",
            } as never)
            .eq("id", RUN_ID);
          return Response.json(
            { error: error instanceof Error ? error.message : "preview_failed", results },
            { status: 500 },
          );
        }
      },
    },
  },
});
