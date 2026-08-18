import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Camera,
  ExternalLink,
  FileUp,
  Film,
  Images,
  Loader2,
  MessageSquarePlus,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { useWorkspace } from "@/components/app/workspace-context";
import { useCurrentUser } from "@/hooks/use-waveos";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: ClientRequestsPage,
  head: () => ({ meta: [{ title: "Requests — WaveOS" }, { name: "robots", content: "noindex" }] }),
});
type RequestType = "video" | "reel" | "photos" | "revision" | "shoot" | "other";
type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  request_type: string;
  status: string | null;
  preferred_at: string | null;
  reference_url: string | null;
  attachment_path: string | null;
  created_at: string;
};
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};
const requestTypes: Array<{ value: RequestType; label: string; icon: typeof Film }> = [
  { value: "video", label: "Video", icon: Film },
  { value: "reel", label: "Reel", icon: Sparkles },
  { value: "photos", label: "Photos", icon: Images },
  { value: "revision", label: "Revision", icon: PencilLine },
  { value: "shoot", label: "Shoot", icon: Camera },
  { value: "other", label: "Other", icon: MessageSquarePlus },
];
const field =
  "min-h-12 w-full rounded-xl border border-border bg-elevated px-4 text-base outline-none focus:border-primary/60";

function ClientRequestsPage() {
  const { activeWorkspace } = useWorkspace();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: "video" as RequestType,
    title: "",
    description: "",
    preferred: "",
    reference: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const requests = useQuery({
    queryKey: ["client-service-requests", activeWorkspace?.id],
    enabled: Boolean(activeWorkspace?.id),
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await db
        .from("client_requests")
        .select(
          "id,title,description,request_type,status,preferred_at,reference_url,attachment_path,created_at",
        )
        .eq("workspace_id", activeWorkspace!.id)
        .not("status", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("create_client_service_request", {
        _workspace_id: activeWorkspace!.id,
        _title: form.title,
        _description: form.description,
        _request_type: form.type,
        _preferred_at: form.preferred ? new Date(`${form.preferred}T12:00:00`).toISOString() : null,
        _reference_url: form.reference || null,
      });
      if (error) throw error;
      const requestId = data as string;
      if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${activeWorkspace!.id}/${requestId}/${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("client-request-attachments")
          .upload(path, attachment);
        if (uploadError) throw uploadError;
        const { error: attachError } = await db.rpc("attach_client_request_file", {
          _request_id: requestId,
          _attachment_path: path,
        });
        if (attachError) throw attachError;
      }
    },
    onSuccess: () => {
      setForm({ type: "video", title: "", description: "", preferred: "", reference: "" });
      setAttachment(null);
      void qc.invalidateQueries({ queryKey: ["client-service-requests"] });
      void qc.invalidateQueries({ queryKey: ["phase4-requests"] });
      toast.success("Request sent to Dream Wave Media.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not send your request."),
  });
  if (!user)
    return (
      <EmptyState
        icon={MessageSquarePlus}
        title="Sign in required"
        body="Sign in to send a request."
      />
    );
  if (!activeWorkspace)
    return (
      <EmptyState
        icon={MessageSquarePlus}
        title="Choose a workspace"
        body="Select a workspace first."
      />
    );
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 pb-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Client requests
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Request something</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell the Dream Wave team what you need. Track progress here after submitting.
        </p>
      </div>
      <form onSubmit={submit} className="surface-card space-y-5 p-4 sm:p-6">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">What do you need?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {requestTypes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, type: value })}
                className={cn(
                  "flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold",
                  form.type === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-elevated",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-2 text-sm font-medium">
          Request title
          <input
            required
            minLength={2}
            maxLength={140}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Example: April product launch Reel"
            className={field}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          What should we know?
          <textarea
            required
            minLength={2}
            maxLength={4000}
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe what you need, the goal, and any important details."
            className={cn(field, "py-3")}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            Preferred date <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              type="date"
              value={form.preferred}
              onChange={(e) => setForm({ ...form, preferred: e.target.value })}
              className={field}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Reference link <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              type="url"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="https://..."
              className={field}
            />
          </label>
        </div>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-elevated px-4 text-sm">
          <FileUp className="h-5 w-5 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            {attachment ? attachment.name : "Attach an image, PDF, or video (optional)"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/quicktime"
            className="sr-only"
            onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          disabled={
            create.isPending || form.title.trim().length < 2 || form.description.trim().length < 2
          }
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-5 w-5" />
          )}
          {create.isPending ? "Sending…" : "Send request"}
        </button>
      </form>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your recent requests</h2>
        {requests.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (requests.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
            No requests yet. Your first request will appear here.
          </p>
        ) : (
          requests.data?.map((request) => (
            <article key={request.id} className="surface-card space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{request.title}</h3>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {request.request_type} · {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                  {(request.status ?? "submitted").replace("_", " ")}
                </span>
              </div>
              {request.description && (
                <p className="text-sm text-muted-foreground">{request.description}</p>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {request.preferred_at && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Preferred {new Date(request.preferred_at).toLocaleDateString()}
                  </span>
                )}
                {request.reference_url && (
                  <a
                    href={request.reference_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Reference
                  </a>
                )}
                {request.attachment_path && <AttachmentLink path={request.attachment_path} />}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function AttachmentLink({ path }: { path: string }) {
  async function openAttachment() {
    const { data, error } = await supabase.storage
      .from("client-request-attachments")
      .createSignedUrl(path, 60);
    if (error) return toast.error("Could not open attachment.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return (
    <button
      type="button"
      onClick={openAttachment}
      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5"
    >
      <FileUp className="h-3.5 w-3.5" />
      Attachment
    </button>
  );
}
