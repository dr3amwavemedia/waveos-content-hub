import { corsHeaders, graphFetch, graphToken, json, staffContext } from "../_shared/outlook.ts";

const emailList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter(
          (email): email is string =>
            typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        )
        .slice(0, 50)
    : [];

const validId = (value: unknown) =>
  typeof value === "string" && value.length > 5 && value.length < 2048;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const textToHtml = (value: string) =>
  escapeHtml(value).replace(/\r?\n/g, "<br>");

async function staffSignature(
  db: any,
  user: { id: string; email?: string | null },
): Promise<{ html: string; text: string }> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("first_name,last_name").eq("id", user.id).maybeSingle(),
    db.from("user_roles").select("role,staff_type").eq("user_id", user.id),
  ]);
  const name =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user.email ||
    "Dream Wave Media";
  const owner = (roles ?? []).some((row: { role: string }) => row.role === "dream_wave_owner");
  const team = (roles ?? []).find((row: { role: string }) => row.role === "dream_wave_team");
  const role = owner
    ? "Admin"
    : team?.staff_type === "media_manager"
      ? "Media Manager"
      : team?.staff_type === "sales"
        ? "Sales"
        : "Dream Wave Media Team";
  const email = user.email ?? "dr3amwavemedia@outlook.com";
  return {
    html: `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #d7dde5;font-family:Arial,Helvetica,sans-serif;color:#172033;line-height:1.45"><div style="font-size:15px;font-weight:700">${escapeHtml(name)}</div><div style="font-size:13px;color:#536174">${escapeHtml(role)} | Dream Wave Media</div><div style="margin-top:5px;font-size:12px;color:#536174"><a href="mailto:${escapeHtml(email)}" style="color:#1688c8;text-decoration:none">${escapeHtml(email)}</a> &nbsp;•&nbsp; <a href="https://dreamwavemedia.co" style="color:#1688c8;text-decoration:none">dreamwavemedia.co</a></div></div>`,
    text: `\n\n—\n${name}\n${role} | Dream Wave Media\n${email}\ndreamwavemedia.co`,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = await staffContext(request);
    if (!auth) return json({ error: "not_authenticated" }, 401);
    const { user, db } = auth;
    const body = await request.json().catch(() => ({}));
    const token = await graphToken(user.id);
    const graph = (path: string, init?: RequestInit) =>
      graphFetch(token, path, { ...init, prefer: 'outlook.body-content-type="text"' });

    if (body.action === "list") {
      const folders: Record<string, string> = {
        inbox: "inbox",
        sent: "sentitems",
        drafts: "drafts",
        deleted: "deleteditems",
      };
      const folder = folders[body.folder] ?? "inbox";
      const params = new URLSearchParams({
        $select:
          "id,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,isDraft",
        $orderby: body.folder === "sent" ? "sentDateTime desc" : "receivedDateTime desc",
        $top: "75",
      });
      const result = await graph(`/me/mailFolders/${folder}/messages?${params}`);
      return json({ messages: result?.value ?? [] });
    }

    if (body.action === "get") {
      if (!validId(body.id)) return json({ error: "invalid_message" }, 400);
      const message = await graph(
        `/me/messages/${encodeURIComponent(body.id)}?$select=id,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,isDraft`,
      );
      return json({ message });
    }

    if (body.action === "mark") {
      if (!validId(body.id)) return json({ error: "invalid_message" }, 400);
      await graph(`/me/messages/${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isRead: Boolean(body.isRead) }),
      });
      return json({ updated: true });
    }

    if (body.action === "delete") {
      if (!validId(body.id)) return json({ error: "invalid_message" }, 400);
      await graph(`/me/messages/${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json({ deleted: true });
    }

    // Replies intentionally do not add the WaveOS signature because the sender is
    // already participating in an existing conversation thread.
    if (body.action === "reply") {
      if (!validId(body.id)) return json({ error: "invalid_message" }, 400);
      await graph(`/me/messages/${encodeURIComponent(body.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ comment: String(body.message ?? "").slice(0, 50_000) }),
      });
      return json({ sent: true });
    }

    if (body.action === "forward") {
      if (!validId(body.id)) return json({ error: "invalid_message" }, 400);
      const recipients = emailList(body.to).map((address) => ({ emailAddress: { address } }));
      if (!recipients.length) return json({ error: "recipient_required" }, 400);
      const signature = await staffSignature(db, user);
      const comment = `${String(body.message ?? "").slice(0, 45_000)}${signature.text}`;
      await graph(`/me/messages/${encodeURIComponent(body.id)}/forward`, {
        method: "POST",
        body: JSON.stringify({ comment, toRecipients: recipients }),
      });
      return json({ sent: true });
    }

    if (body.action === "send" || body.action === "draft") {
      const to = emailList(body.to);
      const cc = emailList(body.cc);
      const bcc = emailList(body.bcc);
      if (!to.length) return json({ error: "recipient_required" }, 400);
      const attachments = Array.isArray(body.attachments)
        ? body.attachments
            .filter(
              (item: unknown) =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as { name?: unknown }).name === "string" &&
                typeof (item as { contentBytes?: unknown }).contentBytes === "string",
            )
            .slice(0, 10)
            .map((item: { name: string; contentType?: string; contentBytes: string }) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: item.name.slice(0, 255),
              contentType: item.contentType ?? "application/octet-stream",
              contentBytes: item.contentBytes,
            }))
        : [];

      const rawMessage = String(body.message ?? "").slice(0, 90_000);
      const signature = body.action === "send" ? await staffSignature(db, user) : null;
      const messageBody = signature
        ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#172033">${textToHtml(rawMessage)}</div>${signature.html}`
        : rawMessage;
      const message = {
        subject: String(body.subject ?? "").slice(0, 255),
        body: {
          contentType: signature ? "HTML" : "Text",
          content: messageBody,
        },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
        bccRecipients: bcc.map((address) => ({ emailAddress: { address } })),
        attachments,
      };
      const result =
        body.action === "send"
          ? await graph("/me/sendMail", {
              method: "POST",
              body: JSON.stringify({ message, saveToSentItems: true }),
            })
          : await graph("/me/messages", { method: "POST", body: JSON.stringify(message) });

      // CRM logging stays under the caller's own RLS permissions.
      if (body.action === "send" && typeof body.accountId === "string") {
        await db.from("crm_activities").insert({
          account_id: body.accountId,
          actor_id: user.id,
          activity_type: "email",
          summary: `Email sent: ${message.subject || "(no subject)"}`,
          safe_metadata: { recipients: to },
        });
        await db
          .from("crm_accounts")
          .update({ last_contacted_at: new Date().toISOString(), updated_by: user.id })
          .eq("id", body.accountId);
      }
      return json({ sent: body.action === "send", draft: result ?? null });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "outlook_mail_failed";
    return json({ error: message }, message === "outlook_not_connected" ? 409 : 500);
  }
});