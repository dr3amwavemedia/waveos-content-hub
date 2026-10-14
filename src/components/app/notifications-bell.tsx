import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-content";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const q = useNotifications();
  const mark = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const clearAll = useMutation({
    mutationFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Please sign in again.");
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("user_id", auth.user.id)
        .is("read_at", null);
      if (error) throw error;
      return readAt;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueryData<typeof items>(["notifications"]);
      const readAt = new Date().toISOString();
      queryClient.setQueryData<typeof items>(["notifications"], (current) =>
        (current ?? []).map((notification) =>
          notification.read_at ? notification : { ...notification, read_at: readAt },
        ),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["notifications"], context.previous);
      toast.error(error instanceof Error ? error.message : "Notifications could not be cleared.");
    },
    onSuccess: () => toast.success("Notifications marked as read."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-elevated hover:text-foreground"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="waveos-notifications-panel"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            id="waveos-notifications-panel"
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Notifications
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  disabled={clearAll.isPending}
                  onClick={() => clearAll.mutate()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {clearAll.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  {clearAll.isPending ? "Clearing…" : "Clear all"}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {q.isError ? (
                <div className="p-5 text-center text-xs text-muted-foreground">
                  <p>Notifications could not be loaded.</p>
                  <button
                    type="button"
                    onClick={() => void q.refetch()}
                    className="mx-auto mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 font-semibold text-foreground"
                  >
                    <RotateCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              ) : q.isPending ? (
                <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
                </div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  You&apos;re all caught up.
                </div>
              ) : (
                items.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => !n.read_at && mark.mutate(n.id)}
                    className={cn(
                      "flex min-h-12 w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-elevated",
                      !n.read_at ? "bg-primary/5" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                        n.read_at ? "bg-muted" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{n.title}</div>
                      {n.body && (
                        <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                      )}
                      <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    {n.read_at && <Check className="h-3 w-3 text-muted-foreground" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
