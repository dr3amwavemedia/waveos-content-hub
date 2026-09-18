import { businessProfile } from "@/lib/business-profile";
import {
  paymentReceiptEmail,
  signedContractEmail,
  type PaymentReceiptEmailInput,
  type SignedContractEmailInput,
} from "@/lib/document-completion-email";

type CompletionEmail =
  ReturnType<typeof paymentReceiptEmail> | ReturnType<typeof signedContractEmail>;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

const safeEmail = (value: unknown) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const portalUrl = (hash: string) => {
  const configured = process.env.WAVEOS_APP_URL ?? "https://waveos.dreamwavemedia.co";
  const url = new URL("/home", configured);
  url.hash = hash;
  return url.toString();
};

const emailHtml = (copy: CompletionEmail) => {
  const url = portalUrl(copy.portalHash);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef4f7;font-family:Arial,sans-serif;color:#102535"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:580px;background:#fff;border:1px solid #d7e4ea;border-radius:18px;overflow:hidden"><tr><td style="background:#07597a;padding:24px 28px;color:#fff;font-size:22px;font-weight:700">Dream Wave Media</td></tr><tr><td style="padding:34px 28px"><h1 style="margin:0 0 14px;font-size:25px">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:1.6;color:#405766">${escapeHtml(copy.message)}</p><a href="${escapeHtml(url)}" style="display:inline-block;margin-top:8px;background:#07597a;color:#fff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">${escapeHtml(copy.buttonLabel)} &rarr;</a><p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#71828d">For your privacy, the document is available after signing in to WaveOS. Do not forward your account access.</p></td></tr><tr><td align="center" style="background:#f8fbfc;border-top:1px solid #e4edf1;padding:22px 28px;font-size:12px;line-height:1.6;color:#71828d">${escapeHtml(businessProfile.signerName)}, ${escapeHtml(businessProfile.signerTitle)}<br>${escapeHtml(businessProfile.phone)} &bull; ${escapeHtml(businessProfile.email ?? "")}<br>${escapeHtml(businessProfile.website.replace(/^https?:\/\//, ""))}</td></tr></table></td></tr></table></body></html>`;
};

async function workspaceRecipients(workspaceId: string, extraRecipient?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: settings }, { data: members }] = await Promise.all([
    supabaseAdmin
      .from("email_automation_settings" as never)
      .select("client_notifications_enabled")
      .eq("id", true)
      .maybeSingle(),
    supabaseAdmin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId),
  ]);
  if (
    (settings as { client_notifications_enabled?: boolean } | null)
      ?.client_notifications_enabled === false
  )
    return [];
  const users = await Promise.all(
    (members ?? []).map(({ user_id }) => supabaseAdmin.auth.admin.getUserById(user_id)),
  );
  return [
    ...new Set(
      [extraRecipient, ...users.map(({ data }) => data.user?.email)]
        .map(safeEmail)
        .filter((email): email is string => Boolean(email)),
    ),
  ];
}

async function deliver(workspaceId: string, copy: CompletionEmail, extraRecipient?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const recipients = await workspaceRecipients(workspaceId, extraRecipient);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM ?? "Jean <jean@dwmsrq.com>";
  for (const recipient of recipients) {
    let status: "sent" | "failed" | "skipped" = apiKey ? "failed" : "skipped";
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;
    if (apiKey) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [recipient],
            subject: copy.subject,
            html: emailHtml(copy),
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };
        status = response.ok ? "sent" : "failed";
        providerMessageId = response.ok && typeof result.id === "string" ? result.id : null;
        errorMessage = response.ok
          ? null
          : (result.message ?? `Email provider error (${response.status})`).slice(0, 500);
      } catch {
        errorMessage = "Email provider request failed";
      }
    }
    await supabaseAdmin.from("transactional_email_log").insert({
      workspace_id: workspaceId,
      event_type: copy.eventType,
      recipient_email: recipient,
      provider_message_id: providerMessageId,
      status,
      error_message: errorMessage,
    });
  }
  return { attempted: recipients.length };
}

export const sendPaymentReceiptEmail = (
  workspaceId: string,
  input: PaymentReceiptEmailInput,
  payerEmail?: string | null,
) => deliver(workspaceId, paymentReceiptEmail(input), payerEmail);

export const sendSignedContractCopyEmail = (
  workspaceId: string,
  input: SignedContractEmailInput,
  signerEmail?: string | null,
) => deliver(workspaceId, signedContractEmail(input), signerEmail);
