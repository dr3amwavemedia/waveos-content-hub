import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/outlook")({
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const db = supabase as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (table: string) => any;
    };
    const { data: role } = await db
      .from("user_roles")
      .select("id")
      .eq("user_id", auth.user.id)
      .in("role", ["dream_wave_owner", "dream_wave_team"])
      .limit(1)
      .maybeSingle();
    if (!role) throw redirect({ to: "/home" });
  },
  component: OutlookPage,
  head: () => ({
    meta: [{ title: "Outlook Calendar — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

type OutlookEvent = {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  location?: { displayName?: string };
  attendees?: Array<{ emailAddress?: { address?: string } }>;
  webLink?: string;
  reminderMinutesBeforeStart?: number;
};

type EventForm = {
  id?: string;
  subject: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
  notes: string;
  reminderMinutes: number;
};

const localInput = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const newForm = (): EventForm => {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    subject: "",
    start: localInput(start),
    end: localInput(end),
    location: "",
    attendees: "",
    notes: "",
    reminderMinutes: 15,
  };
};

async function invoke(name: "oauth" | "calendar", body: Record<string, unknown>) {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  const response = await fetch(`/api/outlook/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.error) throw new Error(data?.error ?? "Outlook request failed");
  return data;
}

function OutlookPage() {
  const [connection, setConnection] = useState<{
    connected: boolean;
    connection?: { email: string } | null;
  } | null>(null);
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EventForm | null>(null);
  const [cursor, setCursor] = useState(() => new Date());

  const range = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    return { start, end };
  }, [cursor]);

  const loadConnection = async () => {
    const data = await invoke("oauth", { action: "status" });
    setConnection(data);
    return Boolean(data.connected);
  };
  const loadEvents = async () => {
    const data = await invoke("calendar", {
      action: "list",
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    setEvents(data.events ?? []);
  };
  const refresh = async () => {
    setLoading(true);
    try {
      if (await loadConnection()) await loadEvents();
      else setEvents([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load Outlook");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [range.start.getTime(), range.end.getTime()]);

  const connect = async () => {
    try {
      const data = await invoke("oauth", { action: "connect" });
      window.location.assign(data.url);
    } catch {
      toast.error("Could not start Outlook connection");
    }
  };

  const edit = (event: OutlookEvent) =>
    setForm({
      id: event.id,
      subject: event.subject,
      start: localInput(new Date(event.start.dateTime)),
      end: localInput(new Date(event.end.dateTime)),
      location: event.location?.displayName ?? "",
      attendees: (event.attendees ?? [])
        .map((item) => item.emailAddress?.address)
        .filter(Boolean)
        .join(", "),
      notes: event.bodyPreview ?? "",
      reminderMinutes: event.reminderMinutesBeforeStart ?? 15,
    });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await invoke("calendar", {
        action: form.id ? "update" : "create",
        ...form,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
        attendees: form.attendees
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
      });
      toast.success(form.id ? "Outlook event updated" : "Outlook event added");
      setForm(null);
      await loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: OutlookEvent) => {
    if (
      !window.confirm(
        `Delete “${event.subject}” from Outlook? Attendees will receive a cancellation.`,
      )
    )
      return;
    try {
      await invoke("calendar", { action: "delete", id: event.id });
      toast.success("Event deleted");
      await loadEvents();
    } catch {
      toast.error("Could not delete event");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Microsoft 365
          </p>
          <h1 className="text-3xl font-semibold">Outlook Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Your WaveOS events sync directly with your own Outlook calendar.
          </p>
        </div>
        <div className="flex gap-2">
          {connection?.connected && (
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          )}
          {connection?.connected && (
            <Button onClick={() => setForm(newForm())}>
              <Plus className="mr-2 h-4 w-4" />
              Add event
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="surface-card flex min-h-52 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !connection?.connected ? (
        <div className="surface-card flex min-h-72 flex-col items-center justify-center text-center">
          <CalendarDays className="mb-4 h-12 w-12 text-primary" />
          <h2 className="text-xl font-semibold">Connect your Outlook calendar</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            WaveOS will only access the signed-in user’s calendar and send meeting invitations as
            that user.
          </p>
          <Button className="mt-5" onClick={connect}>
            Connect Outlook
          </Button>
        </div>
      ) : (
        <>
          <div className="surface-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Connected as {connection.connection?.email}</p>
              <p className="text-xs text-muted-foreground">
                Changes made in Outlook appear here when you refresh.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await invoke("oauth", { action: "disconnect" });
                await refresh();
              }}
            >
              Disconnect
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              Previous
            </Button>
            <h2 className="font-semibold">
              {range.start.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </h2>
            <Button
              variant="outline"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              Next
            </Button>
          </div>
          <div className="surface-card divide-y divide-border p-0">
            {events.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No Outlook events this month.
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-32 text-sm font-semibold text-primary">
                    {new Date(event.start.dateTime).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => edit(event)}>
                    <p className="truncate font-medium">{event.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {event.location?.displayName || "No location"}
                    </p>
                  </button>
                  {event.webLink && (
                    <a
                      href={event.webLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="Open in Outlook"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(event)}
                    aria-label="Delete event"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Outlook event" : "Add Outlook event"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div>
                <Label>Event title</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Starts</Label>
                  <Input
                    type="datetime-local"
                    value={form.start}
                    onChange={(e) => setForm({ ...form, start: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ends</Label>
                  <Input
                    type="datetime-local"
                    value={form.end}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div>
                <Label>Invitee emails (comma separated)</Label>
                <Input
                  value={form.attendees}
                  onChange={(e) => setForm({ ...form, attendees: e.target.value })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div>
                <Label>Reminder (minutes before)</Label>
                <Input
                  type="number"
                  min="0"
                  max="10080"
                  value={form.reminderMinutes}
                  onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
                />
              </div>
              <Button
                className="w-full"
                disabled={saving || !form.subject.trim()}
                onClick={() => void save()}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.id ? "Update event" : "Add to Outlook"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
