import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  // Generated types are updated after the migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type Settings = {
  client_notifications_enabled: boolean;
  staff_notifications_enabled: boolean;
  project_reminders_enabled: boolean;
  invoice_reminders_enabled: boolean;
  upload_notifications_enabled: boolean;
};

const options: Array<{ key: keyof Settings; title: string; body: string }> = [
  {
    key: "client_notifications_enabled",
    title: "Client emails",
    body: "Master switch for automated emails to clients.",
  },
  {
    key: "staff_notifications_enabled",
    title: "Staff copies",
    body: "Send staff a copy of live client notifications.",
  },
  {
    key: "project_reminders_enabled",
    title: "Project reminders",
    body: "Send 30, 5, 3, and 1 day before the shoot/event date.",
  },
  {
    key: "invoice_reminders_enabled",
    title: "Unpaid invoice reminders",
    body: "Send 3, 5, and 7 days after an invoice is issued.",
  },
  {
    key: "upload_notifications_enabled",
    title: "Media and revision emails",
    body: "Notify clients when media or revisions become available.",
  },
];

export function EmailAutomationSettings() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["email-automation-settings"],
    queryFn: async () => {
      const { data, error } = await db
        .from("email_automation_settings")
        .select(
          "client_notifications_enabled,staff_notifications_enabled,project_reminders_enabled,invoice_reminders_enabled,upload_notifications_enabled",
        )
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as Settings;
    },
  });
  const update = useMutation({
    mutationFn: async ({ key, value }: { key: keyof Settings; value: boolean }) => {
      const { error } = await db
        .from("email_automation_settings")
        .update({ [key]: value })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["email-automation-settings"] });
      toast.success("Email automation updated.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update email automation."),
  });
  const test = useMutation({
    mutationFn: async (template: "project" | "invoice" | "upload") => {
      const { error } = await supabase.functions.invoke("email-automations", {
        body: { action: "test", template },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Test email sent to your admin email."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Test email failed."),
  });
  if (settings.isLoading)
    return (
      <div className="surface-card flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!settings.data) return null;
  return (
    <section className="surface-card space-y-5 p-6">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">Email automations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review, test, and control client and staff notifications before enabling them.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {options.map((option) => (
          <div key={option.key} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold">{option.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{option.body}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.data[option.key]}
              disabled={update.isPending}
              onClick={() => update.mutate({ key: option.key, value: !settings.data[option.key] })}
              className={`relative h-8 w-14 shrink-0 rounded-full ${settings.data[option.key] ? "bg-primary" : "bg-elevated ring-1 ring-border"}`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.data[option.key] ? "translate-x-7" : "translate-x-1"}`}
              />
            </button>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Send a test to yourself
        </p>
        <div className="flex flex-wrap gap-2">
          {(["project", "invoice", "upload"] as const).map((template) => (
            <button
              key={template}
              type="button"
              disabled={test.isPending}
              onClick={() => test.mutate(template)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-elevated disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Test {template}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
