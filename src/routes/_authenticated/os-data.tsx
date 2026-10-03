import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Database, Search, X } from "lucide-react";

import { OsDataPanel } from "@/routes/_authenticated/clients";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/os-data")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isOwner = (roles ?? []).some((role) => role.role === "dream_wave_owner");
    if (!isOwner) throw redirect({ to: "/home" });
  },
  component: OsDataPage,
  head: () => ({
    meta: [{ title: "OS Data — WaveOS" }, { name: "robots", content: "noindex" }],
  }),
});

function OsDataPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
            WaveOS public app
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            <Database className="h-8 w-8 text-violet-300" /> OS Data
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage public sign-up users, account information, password resets, plan and payment
            access, and promotional codes without mixing them into Dream Wave Media clients.
          </p>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
          Owner access only
        </span>
      </header>

      <div className="relative max-w-xl">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search OS users by name or email…"
          aria-label="Search OS users"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-11 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear OS user search"
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <OsDataPanel search={search} />
    </div>
  );
}
