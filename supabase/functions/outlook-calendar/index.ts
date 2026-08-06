import {
  adminClient,
  authenticatedStaffUser,
  corsHeaders,
  graphToken,
  json,
} from "../_shared/outlook.ts";

const graph = async (token: string, path: string, init?: RequestInit) => {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="Eastern Standard Time"',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? "Microsoft Graph request failed");
  return result;
};

const validEventId = (value: unknown) =>
  typeof value === "string" && value.length > 5 && value.length < 1024;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const user = await authenticatedStaffUser(request);
    if (!user) return json({ error: "not_authenticated" }, 401);
    const body = await request.json().catch(() => ({}));
    const token = await graphToken(user.id);

    if (body.action === "list") {
      const start = new Date(body.start);
      const end = new Date(body.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
        return json({ error: "invalid_range" }, 400);
      const params = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $select:
          "id,subject,bodyPreview,start,end,location,attendees,isAllDay,webLink,isOnlineMeeting,onlineMeeting,reminderMinutesBeforeStart,isReminderOn",
        $orderby: "start/dateTime",
        $top: "250",
      });
      const result = await graph(token, `/me/calendarView?${params}`);
      return json({ events: result.value ?? [] });
    }

    if (body.action === "delete") {
      if (!validEventId(body.id)) return json({ error: "invalid_event" }, 400);
      await graph(token, `/me/events/${encodeURIComponent(body.id)}`, { method: "DELETE" });
      return json({ deleted: true });
    }

    if (body.action === "create" || body.action === "update") {
      if (body.action === "update" && !validEventId(body.id))
        return json({ error: "invalid_event" }, 400);
      if (typeof body.subject !== "string" || !body.subject.trim() || body.subject.length > 200)
        return json({ error: "invalid_subject" }, 400);
      const start = new Date(body.start);
      const end = new Date(body.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
        return json({ error: "invalid_time" }, 400);
      const attendees = Array.isArray(body.attendees)
        ? body.attendees
            .filter(
              (email: unknown) =>
                typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
            )
            .slice(0, 50)
        : [];
      const event = {
        subject: body.subject.trim(),
        body: {
          contentType: "text",
          content: typeof body.notes === "string" ? body.notes.slice(0, 10_000) : "",
        },
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        location: {
          displayName: typeof body.location === "string" ? body.location.slice(0, 300) : "",
        },
        attendees: attendees.map((email: string) => ({
          emailAddress: { address: email },
          type: "required",
        })),
        isReminderOn: true,
        reminderMinutesBeforeStart: Math.min(
          10080,
          Math.max(0, Number(body.reminderMinutes ?? 15)),
        ),
      };
      const result = await graph(
        token,
        body.action === "create" ? "/me/events" : `/me/events/${encodeURIComponent(body.id)}`,
        { method: body.action === "create" ? "POST" : "PATCH", body: JSON.stringify(event) },
      );
      const admin = adminClient();
      await admin.from("notifications").insert({
        user_id: user.id,
        kind: "generic",
        title: body.action === "create" ? "Outlook event added" : "Outlook event updated",
        body: `${event.subject} · ${start.toLocaleString("en-US", { timeZone: "America/New_York" })}`,
        link: "/outlook",
      });
      return json({ event: result });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "outlook_calendar_failed";
    return json({ error: message }, message === "outlook_not_connected" ? 409 : 500);
  }
});
