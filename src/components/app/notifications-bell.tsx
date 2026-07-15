import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-content";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const q = useNotifications();
  const mark = useMarkNotificationRead();
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-elevated hover:text-foreground"
        aria-label="Notifications"
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
          <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Notifications
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">You're all caught up.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && mark.mutate(n.id)}
                    className={cn(
                      "flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-elevated",
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
                      {n.body && <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
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
