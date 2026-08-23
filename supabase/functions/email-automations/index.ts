import { adminClient, corsHeaders, json } from "../_shared/outlook.ts";

const portal = "https://waveos.dreamwavemedia.co";
const TEST_ADMIN_EMAILS = ["dr3amwavemedia@gmail.com", "jean@dwmsrq.com"] as const;
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const layout = (heading: string, message: string) =>
  `<!doctype html><html><body style="margin:0;background:#eef4f7;font-family:Arial,sans-serif;color:#102535"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" style="max-width:580px;background:#fff;border:1px solid #d7e4ea;border-radius:18px;overflow:hidden"><tr><td style="background:#07597a;padding:24px 28px;color:#fff;font-size:22px;font-weight:700">Dream Wave Media</td></tr><tr><td style="padding:34px 28px"><h1 style="margin:0 0 14px;font-size:25px">${escapeHtml(heading)}</h1><p style="font-size:16px;line-height:1.6;color:#405766">${escapeHtml(message)}</p><a href="${portal}" style="display:inline-block;margin-top:8px;background:#07597a;color:#fff;text-decoration:none;border-radius:10px;padding:13px 20px;font-weight:700">Open client portal →</a></td></tr><tr><td align="center" style="background:#f8fbfc;border-top:1px solid #e4edf1;padding:24px 28px;font-size:12px;line-height:1.6;color:#71828d">Questions or concerns?<br><strong style="color:#405766">Jesse Hayes, Sales Director</strong><br><a href="tel:+19412945727" style="color:#07597a;text-decoration:none">941-294-5727</a> · <a href="mailto:jessehayes@dwmsrq.com" style="color:#07597a;text-decoration:none">jessehayes@dwmsrq.com</a><br><a href="https://dwmsrq.com" style="color:#07597a;text-decoration:none;font-weight:600">dwmsrq.com</a> · <a href="${portal}" style="color:#07597a;text-decoration:none;font-weight:600">Client Portal</a><br><span style="display:inline-block;margin-top:8px;font-size:11px;color:#83939c">© 2026 Dream Wave Media LLC. All rights reserved.</span></td></tr></table></td></tr></table></body></html>`;

async function send(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { status: "skipped", id: null, error: "RESEND_API_KEY is not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:
        Deno.env.get("TRANSACTIONAL_EMAIL_FROM") ?? "Dream Wave Media <notifications@dwmsrq.com>",
      to: [to],
      subject,
      html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok
    ? { status: "sent", id: result.id ?? null, error: null }
    : { status: "failed", id: null, error: result.message ?? `Provider error ${response.status}` };
}

async function emailsForWorkspace(db: ReturnType<typeof adminClient>, workspaceId: string) {
  const { data } = await db
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);
  const users = await Promise.all(
    (data ?? []).map((row) => db.auth.admin.getUserById(row.user_id)),
  );
  return [
    ...new Set(users.map((entry) => entry.data.user?.email?.toLowerCase()).filter(Boolean)),
  ] as string[];
}

async function staffEmails(db: ReturnType<typeof adminClient>) {
  const { data } = await db
    .from("user_roles")
    .select("user_id")
    .in("role", ["dream_wave_owner", "dream_wave_team"]);
  const users = await Promise.all(
    (data ?? []).map((row) => db.auth.admin.getUserById(row.user_id)),
  );
  return [
    ...new Set(users.map((entry) => entry.data.user?.email?.toLowerCase()).filter(Boolean)),
  ] as string[];
}

const dateKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const dayNumber = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const db = adminClient();
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "test") {
      const authorization = request.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!authorization) return json({ error: "owner_required" }, 403);
      const { data: auth } = await db.auth.getUser(authorization);
      if (!auth.user?.email) return json({ error: "owner_required" }, 403);
      const { data: role } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "dream_wave_owner")
        .maybeSingle();
      if (!role) return json({ error: "owner_required" }, 403);
      const templates = {
        project: [
          "Test: Upcoming project reminder",
          "Your project is coming up",
          "Your sample project is scheduled soon. Log in to review the project details and latest updates.",
        ],
        invoice: [
          "Test: Unpaid invoice reminder",
          "A payment reminder",
          "This is a preview of the reminder sent when an invoice remains unpaid.",
        ],
        upload: [
          "Test: New media available",
          "New media is ready",
          "New media or revisions have been uploaded to your client portal.",
        ],
      } as const;
      const template = templates[body.template as keyof typeof templates];
      if (!template) return json({ error: "invalid_template" }, 400);
      const results = await Promise.all(
        TEST_ADMIN_EMAILS.map(async (recipient) => ({
          recipient,
          ...(await send(recipient, template[0], layout(template[1], template[2]))),
        })),
      );
      const failure = results.find((result) => result.status !== "sent");
      if (failure)
        return json(
          {
            error: failure.error ?? `Test email to ${failure.recipient} was not sent.`,
            results,
          },
          failure.status === "failed" ? 502 : 503,
        );
      return json({ status: "sent", sent: results.length, recipients: TEST_ADMIN_EMAILS, results });
    }

    if (
      body.action !== "run" ||
      request.headers.get("x-automation-secret") !== Deno.env.get("EMAIL_AUTOMATION_CRON_SECRET")
    )
      return json({ error: "unauthorized" }, 401);
    const { data: settings } = await db
      .from("email_automation_settings")
      .select("*")
      .eq("id", true)
      .single();
    if (!settings?.client_notifications_enabled && !settings?.staff_notifications_enabled)
      return json({ sent: 0, disabled: true });
    const staff = settings.staff_notifications_enabled ? await staffEmails(db) : [];
    const { data: workspaces } = await db
      .from("workspaces")
      .select("id,name,timezone")
      .eq("is_archived", false);
    let sent = 0;
    for (const workspace of workspaces ?? []) {
      const clients = settings.client_notifications_enabled
        ? await emailsForWorkspace(db, workspace.id)
        : [];
      const recipients = [...new Set([...clients, ...staff])];
      if (!recipients.length) continue;
      const today = dayNumber(dateKey(new Date(), workspace.timezone || "UTC"));
      const events: Array<{
        type: "project" | "invoice";
        id: string;
        day: number;
        subject: string;
        heading: string;
        message: string;
      }> = [];
      if (settings.project_reminders_enabled) {
        const { data: projects } = await db
          .from("projects")
          .select("id,name,event_date")
          .eq("workspace_id", workspace.id)
          .eq("is_active", true)
          .eq("client_visible", true)
          .not("published_at", "is", null)
          .not("event_date", "is", null);
        for (const project of projects ?? []) {
          const days = dayNumber(project.event_date) - today;
          if ([30, 5, 3, 1].includes(days))
            events.push({
              type: "project",
              id: project.id,
              day: days,
              subject: `Project reminder: ${project.name}`,
              heading: days === 1 ? "Your project is tomorrow" : `Your project is in ${days} days`,
              message: `${project.name} is scheduled for ${project.event_date}. Log in to review the details and updates.`,
            });
        }
      }
      if (settings.invoice_reminders_enabled) {
        const { data: invoices } = await db
          .from("client_invoices")
          .select("id,number,description,issued_at")
          .eq("workspace_id", workspace.id)
          .in("status", ["sent", "unpaid", "overdue"]);
        for (const invoice of invoices ?? []) {
          const issued = dayNumber(
            dateKey(new Date(invoice.issued_at), workspace.timezone || "UTC"),
          );
          const days = today - issued;
          if ([3, 5, 7].includes(days))
            events.push({
              type: "invoice",
              id: invoice.id,
              day: days,
              subject: `Payment reminder: ${invoice.number || "Invoice"}`,
              heading: "Your invoice is still unpaid",
              message: `${invoice.number || invoice.description || "Your invoice"} was sent ${days} days ago and is still marked unpaid. Please log in to review payment details.`,
            });
        }
      }
      for (const event of events)
        for (const recipient of recipients) {
          const { data: prior } = await db
            .from("email_automation_deliveries")
            .select("id")
            .eq("entity_type", event.type)
            .eq("entity_id", event.id)
            .eq("reminder_day", event.day)
            .eq("recipient_email", recipient)
            .maybeSingle();
          if (prior) continue;
          const result = await send(recipient, event.subject, layout(event.heading, event.message));
          await db
            .from("email_automation_deliveries")
            .insert({
              workspace_id: workspace.id,
              entity_type: event.type,
              entity_id: event.id,
              reminder_day: event.day,
              recipient_email: recipient,
              provider_message_id: result.id,
              status: result.status,
              error_message: result.error,
            });
          if (result.status === "sent") sent++;
        }
    }
    return json({ sent });
  } catch (error) {
    console.error("email-automations", error);
    return json({ error: error instanceof Error ? error.message : "automation_failed" }, 500);
  }
});
