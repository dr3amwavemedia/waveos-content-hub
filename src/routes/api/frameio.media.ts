import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/frameio/media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireExternalMediaWorkspace } = await import("@/lib/external-media.server");
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
        if (!workspaceId) return json({ error: "workspace_required" }, 400);
        const auth = await requireExternalMediaWorkspace(request, workspaceId);
        if (!auth) return json({ error: "not_authorized" }, 403);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("workspace_frameio_sources" as never)
          .select("*")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        const source = data as unknown as {
          label: string;
          share_url: string;
          frameio_account_id: string | null;
          frameio_project_id: string | null;
          frameio_share_id: string | null;
          sync_status: string;
        } | null;
        if (!source) return json({ configured: true, connected: false, files: [] });

        if (body.action === "status")
          return json({ configured: true, connected: source.sync_status === "ready", label: source.label });

        if (body.action === "sync") {
          const { requireDreamWaveOwner, resolveFrameioShare } = await import("@/lib/frameio.server");
          const owner = await requireDreamWaveOwner(request);
          if (!owner) return json({ error: "owner_required" }, 403);
          try {
            const resolved = await resolveFrameioShare(source.share_url);
            const { error } = await supabaseAdmin
              .from("workspace_frameio_sources" as never)
              .update({
                frameio_account_id: resolved.accountId,
                frameio_project_id: resolved.projectId,
                frameio_share_id: resolved.shareId,
                sync_status: "ready",
                sync_error: null,
              } as never)
              .eq("workspace_id", workspaceId);
            if (error) throw error;
            return json({ ready: true });
          } catch (error) {
            const message = error instanceof Error ? error.message : "frameio_sync_failed";
            await supabaseAdmin
              .from("workspace_frameio_sources" as never)
              .update({ sync_status: "error", sync_error: message } as never)
              .eq("workspace_id", workspaceId);
            return json({ error: message }, 502);
          }
        }

        if (!source.frameio_account_id || !source.frameio_share_id || source.sync_status !== "ready")
          return json({ error: "frameio_share_not_ready" }, 409);
        const { listFrameioShareFiles } = await import("@/lib/frameio.server");
        const allFiles = await listFrameioShareFiles(source.frameio_account_id, source.frameio_share_id);
        const query = typeof body.query === "string" ? body.query.trim().toLowerCase() : "";
        const files = query ? allFiles.filter((file) => file.name.toLowerCase().includes(query)) : allFiles;

        if (body.action === "list") return json({ files, label: source.label });
        if (body.action !== "import") return json({ error: "invalid_action" }, 400);
        const ids = Array.isArray(body.fileIds) ? body.fileIds.filter((id): id is string => typeof id === "string") : [];
        if (!ids.length || ids.length > 20) return json({ error: "invalid_files" }, 400);
        const selected = files.filter((file) => ids.includes(file.id));
        if (selected.length !== new Set(ids).size) return json({ error: "file_not_in_assigned_share" }, 403);
        const imported: Array<{ id: string; name: string }> = [];
        for (const file of selected) {
          const row = {
            workspace_id: workspaceId,
            name: file.name,
            storage_path: null,
            mime_type: file.mediaType,
            size_bytes: file.sizeBytes,
            tags: [],
            uploaded_by: auth.user.id,
            source_provider: "frameio",
            external_file_id: file.id,
            external_parent_id: source.frameio_share_id,
            source_web_url: file.viewUrl,
            thumbnail_url: file.thumbnailUrl,
            source_metadata: { frameio_account_id: source.frameio_account_id, imported_at: new Date().toISOString() },
          };
          const existing = await supabaseAdmin
            .from("media_assets")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("source_provider", "frameio")
            .eq("external_file_id", file.id)
            .maybeSingle();
          const saved = existing.data?.id
            ? await supabaseAdmin.from("media_assets").update(row as never).eq("id", existing.data.id).select("id,name").single()
            : await supabaseAdmin.from("media_assets").insert(row as never).select("id,name").single();
          if (saved.error) return json({ error: saved.error.message }, 500);
          imported.push(saved.data as { id: string; name: string });
        }
        return json({ imported });
      },
    },
  },
});
