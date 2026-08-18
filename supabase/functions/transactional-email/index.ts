import { adminClient, corsHeaders, json } from "../_shared/outlook.ts";

type EmailEvent =
  | "request_updated"
  | "invoice_updated"
  | "revisions_updated"
  | "content_added"
  | "contract_ready";

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

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

const layout = (heading: string, message: string, button?: { label: string; url: string }) => `<!doctype html>
<html><body style="margin:0;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#102535">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dce6eb">
<tr><td style="background:#07597a;padding:24px 28px;color:#fff;font-size:21px;font-weight:700">Dream Wave Media</td></tr>
<tr><td style="padding:30px 28px"><h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${escapeHtml(heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#405766">${escapeHtml(message)}</p>
${button ? `<a href="${escapeHtml(button.url)}" style="display:inline-block;background:#07597a;color:#fff;text-decoration:none;border-radius:999px;padding:14px 22px;font-weight:700">${escapeHtml(button.label)}</a>` : ""}
<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#71828d">This is an automated WaveOS update from Dream Wave Media.</p></td></tr>
</table></td></tr></table></body></html>`;

async function authenticatedStaff(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const db = adminClient();
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user) return null;
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", data.user.id)
    .in("role", ["dream_wave_owner", "dream_wave_team"]).limit(1).maybeSingle();
  return role ? { db, user: data.user } : null;
}

async function clientEmails(db: ReturnType<typeof adminClient>, workspaceId: string) {
  const { data: members, error } = await db.from("workspace_members").select("user_id")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const results = await Promise.all((members ?? []).map(({ user_id }) => db.auth.admin.getUserById(user_id)));
  return [...new Set(results.map(({ data }) => data.user?.email?.toLowerCase()).filter(Boolean))] as string[];
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("TRANSACTIONAL_EMAIL_FROM") ?? "Jean <jean@dwmsrq.com>";
  if (!apiKey) return { configured: false, id: null as string | null, error: null as string | null };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return { configured: true, id: null, error: cleanText(result?.message, `Email provider error (${response.status})`, 500) };
  return { configured: true, id: typeof result?.id === "string" ? result.id : null, error: null };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = await authenticatedStaff(request);
    if (!auth) return json({ error: "staff_required" }, 403);
    const body = await request.json().catch(() => ({}));
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
      if (parsedInviteUrl.pathname !== "/accept-invite" ||
        (configuredAppUrl && parsedInviteUrl.origin !== new URL(configuredAppUrl).origin)) {
        return json({ error: "invalid_invite_url" }, 400);
      }
      const { data: invite, error } = await auth.db.from("invites")
        .select("id,email,workspace_id,app_role,status,expires_at").eq("id", inviteId).single();
      if (error || !invite || invite.status !== "pending") return json({ error: "invite_not_found" }, 404);
      workspaceId = invite.workspace_id;
      recipients = [invite.email.toLowerCase()];
      eventType = invite.app_role === "dream_wave_team" ? "staff_invite" : "client_invite";
      let workspaceName = "WaveOS";
      if (workspaceId) {
        const { data: workspace } = await auth.db.from("workspaces").select("name").eq("id", workspaceId).single();
        workspaceName = workspace?.name ?? workspaceName;
      }
      const staff = eventType === "staff_invite";
      subject = staff ? "You’re invited to join the Dream Wave Media team" : `You’re invited to ${workspaceName} in WaveOS`;
      html = layout("Your WaveOS invitation is ready", staff
        ? "Dream Wave Media invited you to join the staff workspace. Use the secure button below to create or connect your account."
        : `You have been invited to access ${workspaceName}. Use the secure button below to accept your invitation.`,
      { label: "Accept invitation", url: inviteUrl });
    } else if (body.type === "workspace_event") {
      workspaceId = cleanText(body.workspaceId, "", 80);
      eventType = cleanText(body.event, "", 60) as EmailEvent;
      const supported: EmailEvent[] = ["request_updated", "invoice_updated", "revisions_updated", "content_added", "contract_ready"];
      if (!workspaceId || !supported.includes(eventType as EmailEvent)) return json({ error: "invalid_event" }, 400);
      const { data: workspace, error } = await auth.db.from("workspaces").select("id,name").eq("id", workspaceId).single();
      if (error || !workspace) return json({ error: "workspace_not_found" }, 404);
      recipients = await clientEmails(auth.db, workspaceId);
      const item = cleanText(body.title, "An item");
      const status = cleanText(body.status, "updated", 60).replaceAll("_", " ");
      const url = safeHttpsUrl(body.url) ?? safeHttpsUrl(Deno.env.get("WAVEOS_APP_URL"));
      const copy: Record<EmailEvent, { subject: string; heading: string; message: string; label: string }> = {
        request_updated: { subject: `Request updated: ${item}`, heading: "Your request was updated", message: `${item} is now ${status}.`, label: "View request" },
        invoice_updated: { subject: `Invoice updated: ${item}`, heading: "Your invoice was updated", message: `${item} is now ${status}.`, label: "View invoice" },
        revisions_updated: { subject: `Revisions ready: ${item}`, heading: "Your revisions are ready", message: `Updated revisions for ${item} are now available.`, label: "View revisions" },
        content_added: { subject: `New content: ${item}`, heading: "New content was added", message: `${item} is now available in your WaveOS workspace.`, label: "View content" },
        contract_ready: { subject: `Contract ready: ${item}`, heading: "Your contract is ready", message: `${item} is ready to view and sign.`, label: "View contract" },
      };
      const template = copy[eventType as EmailEvent];
      subject = template.subject;
      html = layout(template.heading, template.message, url ? { label: template.label, url } : undefined);
    } else return json({ error: "invalid_type" }, 400);

    if (!recipients.length) return json({ configured: Boolean(Deno.env.get("RESEND_API_KEY")), sent: 0, skipped: true });
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
        workspace_id: workspaceId, invite_id: inviteId, event_type: eventType,
        recipient_email: recipient, provider_message_id: result.id, status, error_message: result.error,
      });
    }
    return json({ configured, sent, attempted: recipients.length, errors: failures });
  } catch (error) {
    console.error("transactional-email", error);
    return json({ error: error instanceof Error ? error.message : "email_failed" }, 500);
  }
});
