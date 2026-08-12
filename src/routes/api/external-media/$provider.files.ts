import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type ProviderFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailUrl: string | null;
  webUrl: string | null;
  parentId: string | null;
};

export const Route = createFileRoute("/api/external-media/$provider/files")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const {
          externalAccessToken,
          getExternalConnection,
          requireExternalMediaWorkspace,
        } = await import("@/lib/external-media.server");
        const provider = params.provider;
        if (provider !== "google_drive" && provider !== "dropbox")
          return json({ error: "unsupported_provider" }, 404);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
        if (!workspaceId) return json({ error: "workspace_required" }, 400);
        const auth = await requireExternalMediaWorkspace(request, workspaceId);
        if (!auth) return json({ error: "not_authorized" }, 403);
        const connection = await getExternalConnection(workspaceId, provider);
        if (!connection) return json({ error: "not_connected" }, 409);
        const accessToken = await externalAccessToken(connection);

        if (body.action === "picker_token" && provider === "google_drive") {
          const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
          const appId = process.env.GOOGLE_DRIVE_APP_ID ?? "";
          const apiKey = process.env.GOOGLE_DRIVE_API_KEY ?? "";
          if (!clientId || !appId || !apiKey)
            return json({ error: "google_picker_not_configured" }, 503);
          return json({ accessToken, clientId, appId, apiKey });
        }

        if (body.action === "import") {
          const files = Array.isArray(body.files) ? body.files : [];
          if (!files.length || files.length > 20) return json({ error: "invalid_files" }, 400);
          const rows = files.map((entry) => {
            const file = entry as Partial<ProviderFile>;
            if (!file.id || !file.name || !file.mimeType)
              throw new Error("invalid_external_file");
            return {
              workspace_id: workspaceId,
              name: file.name,
              storage_path: null,
              mime_type: file.mimeType,
              size_bytes: Number(file.sizeBytes ?? 0),
              tags: [],
              uploaded_by: auth.user.id,
              source_provider: provider,
              external_file_id: file.id,
              external_parent_id: file.parentId ?? null,
              source_web_url: file.webUrl ?? null,
              thumbnail_url: file.thumbnailUrl ?? null,
              source_metadata: { imported_at: new Date().toISOString() },
            };
          });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const uniqueRows = [...new Map(rows.map((row) => [row.external_file_id, row])).values()];
          const imported: Array<{ id: string; name: string }> = [];

          // Do not rely on an ON CONFLICT target here. Some deployed WaveOS
          // databases still have the original partial unique index, which
          // PostgreSQL cannot infer from PostgREST's standard upsert request.
          for (const row of uniqueRows) {
            const { data: existing, error: lookupError } = await supabaseAdmin
              .from("media_assets")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("source_provider", provider)
              .eq("external_file_id", row.external_file_id)
              .maybeSingle();
            if (lookupError) return json({ error: lookupError.message }, 500);

            const query = existing?.id
              ? supabaseAdmin.from("media_assets").update(row as never).eq("id", existing.id)
              : supabaseAdmin.from("media_assets").insert(row as never);
            const { data: saved, error: saveError } = await query.select("id,name").single();
            if (saveError) return json({ error: saveError.message }, 500);
            imported.push(saved as { id: string; name: string });
          }

          return json({ imported });
        }

        if (body.action !== "list") return json({ error: "invalid_action" }, 400);
        const query = typeof body.query === "string" ? body.query.trim() : "";

        if (provider === "google_drive") {
          const filters = ["trashed = false"];
          if (query) filters.push(`name contains '${query.replaceAll("'", "\\'")}'`);
          const endpoint = new URL("https://www.googleapis.com/drive/v3/files");
          endpoint.search = new URLSearchParams({
            q: filters.join(" and "),
            pageSize: "100",
            orderBy: "modifiedTime desc",
            fields:
              "files(id,name,mimeType,size,thumbnailLink,webViewLink,parents,videoMediaMetadata,imageMediaMetadata)",
          }).toString();
          const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const result = (await response.json()) as Record<string, unknown>;
          if (!response.ok) return json({ error: "google_drive_list_failed", details: result }, 502);
          const files = (Array.isArray(result.files) ? result.files : [])
            .map((entry) => {
              const file = entry as Record<string, unknown>;
              const parents = Array.isArray(file.parents) ? file.parents : [];
              return {
                id: String(file.id ?? ""),
                name: String(file.name ?? "Untitled"),
                mimeType: String(file.mimeType ?? "application/octet-stream"),
                sizeBytes: Number(file.size ?? 0),
                thumbnailUrl: typeof file.thumbnailLink === "string" ? file.thumbnailLink : null,
                webUrl: typeof file.webViewLink === "string" ? file.webViewLink : null,
                parentId: typeof parents[0] === "string" ? parents[0] : null,
              } satisfies ProviderFile;
            })
            .filter((file) => /^(image|video)\//.test(file.mimeType));
          return json({ files });
        }

        const response = await fetch(
          query
            ? "https://api.dropboxapi.com/2/files/search_v2"
            : "https://api.dropboxapi.com/2/files/list_folder",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              query
                ? { query, options: { max_results: 100, file_status: "active" } }
                : { path: "", recursive: true, include_deleted: false, limit: 100 },
            ),
          },
        );
        const result = (await response.json()) as Record<string, unknown>;
        if (!response.ok) return json({ error: "dropbox_list_failed", details: result }, 502);
        const rawEntries = query
          ? (Array.isArray(result.matches) ? result.matches : []).map((match) =>
              (match as Record<string, unknown>).metadata,
            )
          : Array.isArray(result.entries)
            ? result.entries
            : [];
        const files = rawEntries
          .map((entry) => {
            const wrapped = entry as Record<string, unknown>;
            const file = (wrapped.metadata ?? wrapped) as Record<string, unknown>;
            const name = String(file.name ?? "Untitled");
            const extension = name.split(".").pop()?.toLowerCase() ?? "";
            const mimeType = dropboxMimeType(extension);
            if (!mimeType) return null;
            return {
              id: String(file.id ?? file.path_lower ?? ""),
              name,
              mimeType,
              sizeBytes: Number(file.size ?? 0),
              thumbnailUrl: null,
              webUrl: null,
              parentId: typeof file.path_lower === "string" ? file.path_lower : null,
            } satisfies ProviderFile;
          })
          .filter(Boolean);
        return json({ files });
      },
    },
  },
});

function dropboxMimeType(extension: string) {
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
  };
  return types[extension] ?? null;
}
