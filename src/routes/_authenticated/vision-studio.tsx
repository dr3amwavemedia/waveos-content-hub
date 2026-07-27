import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Copy, FilePlus2, Loader2, PanelTop, Presentation, Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { createDefaultVisionDeckContent } from "@/features/vision-decks/defaults";
import { VisionDeckEditor, type VisionDeckSavePayload } from "@/features/vision-decks/vision-deck-editor";
import { parseVisionDeckContent, serializeVisionDeckContent, type VisionDeck } from "@/features/vision-decks/types";

export const Route = createFileRoute("/_authenticated/vision-studio")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      throw redirect({ to: "/auth" });
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);

    const isStaff = (roles ?? []).some((role) => role.role === "dream_wave_owner" || role.role === "dream_wave_team");

    if (!isStaff) {
      throw redirect({ to: "/home" });
    }
  },
  component: VisionStudioPage,
  head: () => ({
    meta: [{ title: "Vision Studio — WaveOS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
});

function VisionStudioPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const decksQuery = useQuery({
    queryKey: ["vision-decks"],
    queryFn: async (): Promise<VisionDeck[]> => {
      const { data, error } = await supabase
        .from("vision_decks")
        .select("*")
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, content: parseVisionDeckContent(row.content) })) as VisionDeck[];
    },
  });

  useEffect(() => {
    if (!selectedId && decksQuery.data?.length) setSelectedId(decksQuery.data[0].id);
    if (selectedId && decksQuery.data && !decksQuery.data.some((deck) => deck.id === selectedId)) {
      setSelectedId(decksQuery.data[0]?.id ?? null);
    }
  }, [decksQuery.data, selectedId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vision-decks"] });
  };

  const createDeck = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Your session is still loading.");
      const companyName = "New prospect";
      const { data, error } = await supabase
        .from("vision_decks")
        .insert({
          title: "Untitled vision deck",
          company_name: companyName,
          content: serializeVisionDeckContent(createDefaultVisionDeckContent(companyName)),
          created_by: user.userId,
          updated_by: user.userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await refresh();
      setSelectedId(data.id);
      toast.success("Vision deck created.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not create the deck."),
  });

  const saveDeck = useMutation({
    mutationFn: async ({ id, payload, publish }: { id: string; payload: VisionDeckSavePayload; publish?: boolean }) => {
      if (!user) throw new Error("Your session is still loading.");
      const { error } = await supabase
        .from("vision_decks")
        .update({
          ...payload,
          content: serializeVisionDeckContent(payload.content),
          updated_by: user.userId,
          ...(publish ? { status: "ready" as const, share_enabled: true, published_at: new Date().toISOString() } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await refresh();
      toast.success(variables.publish ? "Prospect link is live." : "Vision deck saved.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save the deck."),
  });

  const disableShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vision_decks").update({ share_enabled: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Prospect link disabled.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not disable the link."),
  });

  const archiveDeck = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vision_decks")
        .update({ status: "archived", share_enabled: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedId(null);
      await refresh();
      toast.success("Vision deck archived.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not archive the deck."),
  });

  const duplicateDeck = useMutation({
    mutationFn: async (deck: VisionDeck) => {
      if (!user) throw new Error("Your session is still loading.");
      const { data, error } = await supabase
        .from("vision_decks")
        .insert({
          title: `${deck.title} — Copy`,
          company_name: deck.company_name,
          prospect_name: deck.prospect_name,
          prospect_email: deck.prospect_email,
          accent_color: deck.accent_color,
          content: serializeVisionDeckContent(deck.content),
          created_by: user.userId,
          updated_by: user.userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await refresh();
      setSelectedId(data.id);
      toast.success("Independent draft created.");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not duplicate the deck."),
  });

  const decks = decksQuery.data ?? [];
  const selected = decks.find((deck) => deck.id === selectedId) ?? null;
  const saving = saveDeck.isPending || disableShare.isPending || archiveDeck.isPending || duplicateDeck.isPending;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Dream Wave sales experience
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Vision Studio</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Turn discovery notes, creative references, content plans, and defensible ROI scenarios into a guided
            prospect experience. Only authorized Dream Wave staff can access this studio.
          </p>
        </div>
        <button
          onClick={() => createDeck.mutate()}
          disabled={createDeck.isPending || !user}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 disabled:opacity-50"
        >
          {createDeck.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          New vision deck
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Active decks</h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {decks.length} {decks.length === 1 ? "prospect" : "prospects"}
                </p>
              </div>
              <Presentation className="h-4 w-4 text-primary" />
            </div>

            {decksQuery.isLoading ? (
              <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading studio…
              </div>
            ) : decks.length === 0 ? (
              <div className="p-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <PanelTop className="h-4 w-4" />
                </div>
                <p className="mt-3 text-xs font-medium text-foreground">No decks yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Create a reusable prospect story from the starter structure.
                </p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto p-2 xl:max-h-[calc(100dvh-18rem)]">
                {decks.map((deck) => (
                  <button
                    key={deck.id}
                    onClick={() => setSelectedId(deck.id)}
                    className={cn(
                      "mb-1 w-full rounded-xl border px-3 py-3 text-left transition",
                      selectedId === deck.id
                        ? "border-primary/35 bg-primary/[0.08]"
                        : "border-transparent hover:border-border hover:bg-elevated/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{deck.company_name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{deck.title}</p>
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                          deck.share_enabled ? "bg-success shadow-[0_0_8px] shadow-success" : "bg-muted-foreground/35",
                        )}
                        title={deck.share_enabled ? "Live" : "Draft"}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        {new Date(deck.updated_at).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {deck.share_enabled ? (
                          <>
                            <Radio className="h-3 w-3 text-success" /> Live
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Draft
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          {selected ? (
            <VisionDeckEditor
              key={selected.id}
              deck={selected}
              isSaving={saving}
              onSave={(payload) => saveDeck.mutateAsync({ id: selected.id, payload })}
              onPublish={(payload) => saveDeck.mutateAsync({ id: selected.id, payload, publish: true })}
              onDisableShare={() => disableShare.mutateAsync(selected.id)}
              onArchive={() => archiveDeck.mutateAsync(selected.id)}
              onDuplicate={() => duplicateDeck.mutateAsync(selected)}
            />
          ) : (
            <EmptyState
              icon={Presentation}
              title="Create a prospect vision"
              body="Start from a complete Dream Wave narrative, customize the meeting insights and creative references, then preview the interactive experience."
            />
          )}
        </section>
      </div>
    </div>
  );
}
