import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/outlook/calendar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { outlookGraphToken, requireOutlookStaff } = await import("@/lib/outlook.server");
          const auth = await requireOutlookStaff(request);
          if (!auth) return json({ error: "not_authenticated" }, 401);
          const { user, db } = auth;
          const body = await request.json().catch(() => ({}));
          const token = await outlookGraphToken(user.id, db);
          const graph = async (path: string, init?: RequestInit) => {
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
            if (!response.ok)
              throw new Error(result?.error?.message ?? "Microsoft Graph request failed");
            return result;
          };

          if (body.action === "list") {
            const start = new Date(body.start);
            const end = new Date(body.end);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
              return json({ error: "invalid_range" }, 400);
            const params = new URLSearchParams({
              startDateTime: start.toISOString(),
              endDateTime: end.toISOString(),
              $select:
                "id,subject,bodyPreview,start,end,location,attendees,isAllDay,webLink,reminderMinutesBeforeStart",
              $orderby: "start/dateTime",
              $top: "250",
            });
            const result = await graph(`/me/calendarView?${params}`);
            return json({ events: result.value ?? [] });
          }
          if (body.action === "delete") {
            if (typeof body.id !== "string" || body.id.length < 6)
              return json({ error: "invalid_event" }, 400);
            await graph(`/me/events/${encodeURIComponent(body.id)}`, { method: "DELETE" });
            return json({ deleted: true });
          }
          if (body.action === "create" || body.action === "update") {
            if (body.action === "update" && (typeof body.id !== "string" || body.id.length < 6))
              return json({ error: "invalid_event" }, 400);
            if (typeof body.subject !== "string" || !body.subject.trim())
              return json({ error: "invalid_subject" }, 400);
            const start = new Date(body.start);
            const end = new Date(body.end);
            if (
              !Number.isFinite(start.getTime()) ||
              !Number.isFinite(end.getTime()) ||
              end <= start
            )
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
              subject: body.subject.trim().slice(0, 200),
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
              body.action === "create" ? "/me/events" : `/me/events/${encodeURIComponent(body.id)}`,
              { method: body.action === "create" ? "POST" : "PATCH", body: JSON.stringify(event) },
            );
            await db.from("notifications").insert({
              user_id: user.id,
              kind: "generic",
              title: body.action === "create" ? "Outlook event added" : "Outlook event updated",
              body: event.subject,
              link: "/outlook",
            });
            return json({ event: result });
          }
          return json({ error: "invalid_action" }, 400);
        } catch (error) {
          console.error(error);
          return json(
            { error: error instanceof Error ? error.message : "outlook_calendar_failed" },
            500,
          );
        }
      },
    },
  },
});
