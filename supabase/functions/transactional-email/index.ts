import { adminClient, corsHeaders, json } from "../_shared/outlook.ts";

type EmailEvent =
  "request_updated" | "invoice_updated" | "revisions_updated" | "content_added" | "contract_ready";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const cleanText = (value: unknown, fallback: string, max = 180) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

const safeHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const emailLogoUrl = () => {
  const configuredLogo = safeHttpsUrl(Deno.env.get("TRANSACTIONAL_EMAIL_LOGO_URL"));
  if (configuredLogo) return configuredLogo;
  const appUrl = safeHttpsUrl(Deno.env.get("WAVEOS_APP_URL"));
  return appUrl ? new URL("/waveos-icon-192.png", appUrl).toString() : null;
};

const layout = (
  heading: string,
  message: string,
  button?: { label: string; url: string },
) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700&display=swap" rel="stylesheet">
</head><body style="margin:0;background:#eef4f7;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#102535">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(heading)} from Dream Wave Media</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f7"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #d7e4ea;box-shadow:0 18px 50px rgba(7,89,122,.12)">
<tr><td style="background:#07597a;background-image:linear-gradient(135deg,#064d6b 0%,#075b7e 55%,#0a7699 100%);padding:26px 30px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td width="62" valign="middle">${emailLogoUrl() ? `<img src="${escapeHtml(emailLogoUrl()!)}" width="54" height="54" alt="Dream Wave Media" style="display:block;border:0;border-radius:12px">` : `<div style="width:54px;height:54px;border-radius:12px;background:#fff;color:#07597a;text-align:center;line-height:54px;font-family:Poppins,Inter,Arial,sans-serif;font-size:20px;font-weight:700">DW</div>`}</td>
<td valign="middle" style="padding-left:14px;color:#fff"><div style="font-family:Poppins,Inter,'Segoe UI',Arial,sans-serif;font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-.3px">Dream Wave Media</div><div style="margin-top:5px;font-size:11px;line-height:1.2;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#bfe9f5">Powered by WaveOS</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 30px 32px"><div style="width:42px;height:4px;margin:0 0 20px;border-radius:999px;background:#18a6ca"></div>
<h1 style="margin:0 0 14px;font-family:Poppins,Inter,'Segoe UI',Arial,sans-serif;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-.5px;color:#102535">${escapeHtml(heading)}</h1>
<p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#405766">${escapeHtml(message)}</p>
${button ? `<a href="${escapeHtml(button.url)}" style="display:inline-block;background:#07597a;color:#fff;text-decoration:none;border-radius:12px;padding:14px 24px;font-family:Inter,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.2;font-weight:600;box-shadow:0 8px 20px rgba(7,89,122,.2)">${escapeHtml(button.label)} &rarr;</a>` : ""}
</td></tr>
<tr><td style="border-top:1px solid #e4edf1;background:#f8fbfc;padding:20px 30px"><p style="margin:0;font-size:12px;line-height:1.6;color:#71828d">This automated WaveOS email was sent by Dream Wave Media. Please do not share secure invitation or workspace links.</p></td></tr>
</table><p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#83939c">Dream Wave Media &bull; WaveOS</p></td></tr></table></body></html>`;

/** Admin notification recipients for internal WaveOS alerts. */
const ADMIN_NOTIFICATION_EMAILS = (
  Deno.env.get("WAVEOS_ADMIN_NOTIFICATION_EMAILS") ?? "jessehayes@dwmsrq.com,jean@dwmsrq.com"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const db = adminClient();
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user) return null;
  return { db, user: data.user };
}

async function authenticatedStaff(request: Request) {
  const context = await authenticatedUser(request);
  if (!context) return null;
  const { data: role } = await context.db
    .from("user_roles")
    .select("role")
    .eq("user_id", context.user.id)
    .in("role", ["dream_wave_owner", "dream_wave_team"])
    .limit(1)
    .maybeSingle();
  return role ? context : null;
}


async function clientEmails(db: ReturnType<typeof adminClient>, workspaceId: string) {
  const { data: members, error } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const results = await Promise.all(
    (members ?? []).map(({ user_id }) => db.auth.admin.getUserById(user_id)),
  );
  return [
    ...new Set(results.map(({ data }) => data.user?.email?.toLowerCase()).filter(Boolean)),
  ] as string[];
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("TRANSACTIONAL_EMAIL_FROM") ?? "Jean <jean@dwmsrq.com>";
  if (!apiKey)
    return { configured: false, id: null as string | null, error: null as string | null };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    return {
      configured: true,
      id: null,
      error: cleanText(result?.message, `Email provider error (${response.status})`, 500),
    };
  return { configured: true, id: typeof result?.id === "string" ? result.id : null, error: null };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    // A newly joined member is not staff yet, so this event authenticates as
    // any signed-in user and only ever mails the fixed admin recipients.
    const auth =
      body.type === "member_joined"
        ? await authenticatedUser(request)
        : await authenticatedStaff(request);
    if (!auth) return json({ error: "staff_required" }, 403);
    let workspaceId: string | null = null;
    let inviteId: string | null = null;
    let eventType = "";
    let recipients: string[] = [];
    let subject = "";
    let html = "";



    if (body.type === "invite") {
      inviteId = cleanText(body.inviteId, "", 80);
      const inviteUrl = safeHttpsUrl(body.url);
      if (!inviteId || !inviteUrl) return json({ error: "invalid_invite" }, 400);
      const parsedInviteUrl = new URL(inviteUrl);
      const configuredAppUrl = safeHttpsUrl(Deno.env.get("WAVEOS_APP_URL"));
      if (
        parsedInviteUrl.pathname !== "/accept-invite" ||
        (configuredAppUrl && parsedInviteUrl.origin !== new URL(configuredAppUrl).origin)
      ) {
        return json({ error: "invalid_invite_url" }, 400);
      }
      const { data: invite, error } = await auth.db
        .from("invites")
        .select("id,email,workspace_id,app_role,status,expires_at")
        .eq("id", inviteId)
        .single();
      if (error || !invite || invite.status !== "pending")
        return json({ error: "invite_not_found" }, 404);
      workspaceId = invite.workspace_id;
      recipients = [invite.email.toLowerCase()];
      eventType = invite.app_role === "dream_wave_team" ? "staff_invite" : "client_invite";
      let workspaceName = "WaveOS";
      if (workspaceId) {
        const { data: workspace } = await auth.db
          .from("workspaces")
          .select("name")
          .eq("id", workspaceId)
          .single();
        workspaceName = workspace?.name ?? workspaceName;
      }
      const staff = eventType === "staff_invite";
      subject = staff
        ? "You’re invited to join the Dream Wave Media team"
        : `You’re invited to ${workspaceName} in WaveOS`;
      html = layout(
        "Your WaveOS invitation is ready",
        staff
          ? "Dream Wave Media invited you to join the staff workspace. Use the secure button below to create or connect your account."
          : `You have been invited to access ${workspaceName}. Use the secure button below to accept your invitation.`,
        { label: "Accept invitation", url: inviteUrl },
      );
    } else if (body.type === "workspace_event") {
      workspaceId = cleanText(body.workspaceId, "", 80);
      eventType = cleanText(body.event, "", 60) as EmailEvent;
      const supported: EmailEvent[] = [
        "request_updated",
        "invoice_updated",
        "revisions_updated",
        "content_added",
        "contract_ready",
      ];
      if (!workspaceId || !supported.includes(eventType as EmailEvent))
        return json({ error: "invalid_event" }, 400);
      const { data: workspace, error } = await auth.db
        .from("workspaces")
        .select("id,name")
        .eq("id", workspaceId)
        .single();
      if (error || !workspace) return json({ error: "workspace_not_found" }, 404);
      recipients = await clientEmails(auth.db, workspaceId);
      const item = cleanText(body.title, "An item");
      const status = cleanText(body.status, "updated", 60).replaceAll("_", " ");
      const url = safeHttpsUrl(body.url) ?? safeHttpsUrl(Deno.env.get("WAVEOS_APP_URL"));
      const copy: Record<
        EmailEvent,
        { subject: string; heading: string; message: string; label: string }
      > = {
        request_updated: {
          subject: `Request updated: ${item}`,
          heading: "Your request was updated",
          message: `${item} is now ${status}.`,
          label: "View request",
        },
        invoice_updated: {
          subject: `Invoice updated: ${item}`,
          heading: "Your invoice was updated",
          message: `${item} is now ${status}.`,
          label: "View invoice",
        },
        revisions_updated: {
          subject: `Revisions ready: ${item}`,
          heading: "Your revisions are ready",
          message: `Updated revisions for ${item} are now available.`,
          label: "View revisions",
        },
        content_added: {
          subject: `New content: ${item}`,
          heading: "New content was added",
          message: `${item} is now available in your WaveOS workspace.`,
          label: "View content",
        },
        contract_ready: {
          subject: `Contract ready: ${item}`,
          heading: "Your contract is ready",
          message: `${item} is ready to view and sign.`,
          label: "View contract",
        },
      };
      const template = copy[eventType as EmailEvent];
      subject = template.subject;
      html = layout(
        template.heading,
        template.message,
        url ? { label: template.label, url } : undefined,
      );
    } else return json({ error: "invalid_type" }, 400);

    if (!recipients.length)
      return json({ configured: Boolean(Deno.env.get("RESEND_API_KEY")), sent: 0, skipped: true });
    let sent = 0;
    let configured = true;
    const failures: string[] = [];
    for (const recipient of recipients) {
      const result = await sendEmail(recipient, subject, html);
      configured = result.configured;
      const status = !result.configured ? "skipped" : result.error ? "failed" : "sent";
      if (status === "sent") sent += 1;
      if (result.error) failures.push(result.error);
      await auth.db.from("transactional_email_log").insert({
        workspace_id: workspaceId,
        invite_id: inviteId,
        event_type: eventType,
        recipient_email: recipient,
        provider_message_id: result.id,
        status,
        error_message: result.error,
      });
    }
    return json({ configured, sent, attempted: recipients.length, errors: failures });
  } catch (error) {
    console.error("transactional-email", error);
    return json({ error: error instanceof Error ? error.message : "email_failed" }, 500);
  }
});
