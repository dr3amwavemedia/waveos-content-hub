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
  path: string | null;
  modifiedAt: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

type ProviderFolder = {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
};

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);

export const Route = createFileRoute("/api/external-media/$provider/files")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { externalAccessToken, getExternalConnection, requireExternalMediaWorkspace } =
          await import("@/lib/external-media.server");
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
        let accessToken: string;
        try {
          accessToken = await externalAccessToken(connection);
        } catch (tokenError) {
          const message = tokenError instanceof Error ? tokenError.message : "";
          if (message.endsWith("reconnect_required")) {
            console.warn(`External media reconnect required for workspace ${workspaceId}`);
            return json(
              {
                error:
                  provider === "google_drive"
                    ? "Google Drive access expired. Reconnect Google Drive in Settings to continue."
                    : "Dropbox access expired. Reconnect Dropbox in Settings to continue.",
                code: "reconnect_required",
                provider,
              },
              409,
            );
          }
          throw tokenError;
        }

        if (body.action === "picker_token" && provider === "google_drive") {
          const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
          const appId = process.env.GOOGLE_DRIVE_APP_ID ?? "";
          const apiKey = process.env.GOOGLE_DRIVE_API_KEY ?? "";
          if (!clientId || !appId || !apiKey)
            return json({ error: "google_picker_not_configured" }, 503);
          return json({ accessToken, clientId, appId, apiKey });
        }

        if (body.action === "preview_url" && provider === "google_drive") {
          const assetId = typeof body.assetId === "string" ? body.assetId : "";
          if (!assetId) return json({ error: "asset_required" }, 400);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: asset, error } = await supabaseAdmin
            .from("media_assets")
            .select("id")
            .eq("id", assetId)
            .eq("workspace_id", workspaceId)
            .eq("source_provider", "google_drive")
            .maybeSingle();
          if (error) return json({ error: error.message }, 500);
          if (!asset) return json({ error: "asset_not_found" }, 404);
          const { createExternalRelayUrl } = await import("@/lib/external-media.server");
          const url = new URL(await createExternalRelayUrl(asset.id, 60 * 60));
          if (body.mode === "thumbnail") url.searchParams.set("preview", "thumbnail");
          return json({ url: url.toString() });
        }

        if (body.action === "preview_url" && provider === "dropbox") {
          const assetId = typeof body.assetId === "string" ? body.assetId : "";
          if (!assetId) return json({ error: "asset_required" }, 400);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: asset, error } = await supabaseAdmin
            .from("media_assets")
            .select("external_file_id")
            .eq("id", assetId)
            .eq("workspace_id", workspaceId)
            .eq("source_provider", "dropbox")
            .maybeSingle();
          if (error) return json({ error: error.message }, 500);
          if (!asset?.external_file_id) return json({ error: "asset_not_found" }, 404);
          const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ path: asset.external_file_id }),
          });
          const result = (await response.json()) as Record<string, unknown>;
          if (!response.ok || typeof result.link !== "string")
            return json({ error: "dropbox_preview_unavailable" }, 502);
          return json({ url: result.link });
        }

        if (body.action === "import") {
          const files = Array.isArray(body.files) ? body.files : [];
          if (!files.length || files.length > 20) return json({ error: "invalid_files" }, 400);
          const rows = files.map((entry) => {
            const file = entry as Partial<ProviderFile>;
            if (!file.id || !file.name || !file.mimeType) throw new Error("invalid_external_file");
            const mimeType = externalMediaMimeType(file.name, file.mimeType);
            if (!SUPPORTED_MEDIA_TYPES.has(mimeType.toLowerCase()))
              throw new Error("invalid_external_file");
            return {
              workspace_id: workspaceId,
              name: file.name,
              storage_path: null,
              mime_type: mimeType,
              size_bytes: Number(file.sizeBytes ?? 0),
              tags: [],
              uploaded_by: auth.user.id,
              source_provider: provider,
              external_file_id: file.id,
              external_parent_id: file.parentId ?? null,
              source_web_url: file.webUrl ?? null,
              thumbnail_url: file.thumbnailUrl ?? null,
              width: positiveNumberOrNull(file.width),
              height: positiveNumberOrNull(file.height),
              duration_seconds: positiveNumberOrNull(file.durationSeconds),
              source_metadata: {
                imported_at: new Date().toISOString(),
                source_path: file.path ?? null,
                source_modified_at: file.modifiedAt ?? null,
              },
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
              ? supabaseAdmin
                  .from("media_assets")
                  .update(row as never)
                  .eq("id", existing.id)
              : supabaseAdmin.from("media_assets").insert(row as never);
            const { data: saved, error: saveError } = await query.select("id,name").single();
            if (saveError) return json({ error: saveError.message }, 500);
            imported.push(saved as { id: string; name: string });
          }

          return json({ imported });
        }

        if (body.action !== "list") return json({ error: "invalid_action" }, 400);
        const query = typeof body.query === "string" ? body.query.trim() : "";
        const folderId = typeof body.folderId === "string" ? body.folderId : null;

        if (provider === "google_drive") {
          const filters = ["trashed = false"];
          if (query) filters.push(`name contains '${query.replaceAll("'", "\\'")}'`);
          else if (folderId) filters.push(`'${folderId.replaceAll("'", "\\'")}' in parents`);
          const endpoint = new URL("https://www.googleapis.com/drive/v3/files");
          endpoint.search = new URLSearchParams({
            q: filters.join(" and "),
            pageSize: "100",
            orderBy: "modifiedTime desc",
            fields:
              "files(id,name,mimeType,size,thumbnailLink,webViewLink,parents,modifiedTime,videoMediaMetadata,imageMediaMetadata)",
          }).toString();
          const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const result = (await response.json()) as Record<string, unknown>;
          if (!response.ok)
            return json({ error: "google_drive_list_failed", details: result }, 502);
          const entries = Array.isArray(result.files) ? result.files : [];
          const folders = entries
            .filter(
              (entry) =>
                (entry as Record<string, unknown>).mimeType ===
                "application/vnd.google-apps.folder",
            )
            .map((entry) => {
              const folder = entry as Record<string, unknown>;
              const parents = Array.isArray(folder.parents) ? folder.parents : [];
              return {
                id: String(folder.id ?? ""),
                name: String(folder.name ?? "Untitled folder"),
                parentId: typeof parents[0] === "string" ? parents[0] : null,
                path: null,
              } satisfies ProviderFolder;
            });
          const files = entries
            .map((entry) => {
              const file = entry as Record<string, unknown>;
              const parents = Array.isArray(file.parents) ? file.parents : [];
              const imageMetadata = recordOrEmpty(file.imageMediaMetadata);
              const videoMetadata = recordOrEmpty(file.videoMediaMetadata);
              return {
                id: String(file.id ?? ""),
                name: String(file.name ?? "Untitled"),
                mimeType: String(file.mimeType ?? "application/octet-stream"),
                sizeBytes: Number(file.size ?? 0),
                thumbnailUrl: typeof file.thumbnailLink === "string" ? file.thumbnailLink : null,
                webUrl: typeof file.webViewLink === "string" ? file.webViewLink : null,
                parentId: typeof parents[0] === "string" ? parents[0] : null,
                path: null,
                modifiedAt: typeof file.modifiedTime === "string" ? file.modifiedTime : null,
                width: positiveNumberOrNull(imageMetadata.width ?? videoMetadata.width),
                height: positiveNumberOrNull(imageMetadata.height ?? videoMetadata.height),
                durationSeconds: millisecondsToSeconds(videoMetadata.durationMillis),
              } satisfies ProviderFile;
            })
            .filter((file) => SUPPORTED_MEDIA_TYPES.has(file.mimeType.toLowerCase()));
          return json({ files, folders });
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
                : {
                    path: folderId ?? "",
                    recursive: false,
                    include_deleted: false,
                    include_media_info: true,
                    limit: 100,
                  },
            ),
          },
        );
        const result = (await response.json()) as Record<string, unknown>;
        if (!response.ok) return json({ error: "dropbox_list_failed", details: result }, 502);
        const rawEntries = query
          ? (Array.isArray(result.matches) ? result.matches : []).map(
              (match) => (match as Record<string, unknown>).metadata,
            )
          : Array.isArray(result.entries)
            ? result.entries
            : [];
        const folders = query
          ? []
          : rawEntries
              .map((entry) => {
                const wrapped = entry as Record<string, unknown>;
                const folder = (wrapped.metadata ?? wrapped) as Record<string, unknown>;
                if (folder[".tag"] !== "folder") return null;
                const path = typeof folder.path_lower === "string" ? folder.path_lower : null;
                return {
                  id: path ?? String(folder.id ?? ""),
                  name: String(folder.name ?? "Untitled folder"),
                  parentId: dropboxParentPath(path),
                  path: typeof folder.path_display === "string" ? folder.path_display : path,
                } satisfies ProviderFolder;
              })
              .filter((folder): folder is ProviderFolder => Boolean(folder?.id));
        const files = rawEntries
          .map((entry) => {
            const wrapped = entry as Record<string, unknown>;
            const file = (wrapped.metadata ?? wrapped) as Record<string, unknown>;
            const name = String(file.name ?? "Untitled");
            const extension = name.split(".").pop()?.toLowerCase() ?? "";
            const mimeType = dropboxMimeType(extension);
            if (!mimeType) return null;
            const path = typeof file.path_lower === "string" ? file.path_lower : null;
            const mediaInfo = recordOrEmpty(file.media_info);
            const mediaMetadata = recordOrEmpty(mediaInfo.metadata);
            const dimensions = recordOrEmpty(mediaMetadata.dimensions);
            return {
              id: String(file.id ?? file.path_lower ?? ""),
              name,
              mimeType,
              sizeBytes: Number(file.size ?? 0),
              thumbnailUrl: null,
              webUrl: null,
              parentId: dropboxParentPath(path),
              path: typeof file.path_display === "string" ? file.path_display : path,
              modifiedAt: typeof file.server_modified === "string" ? file.server_modified : null,
              width: positiveNumberOrNull(dimensions.width),
              height: positiveNumberOrNull(dimensions.height),
              durationSeconds: millisecondsToSeconds(mediaMetadata.duration),
            } satisfies ProviderFile;
          })
          .filter(Boolean) as ProviderFile[];
        return json({ files, folders });
      },
    },
  },
});

function dropboxMimeType(extension: string) {
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };
  return types[extension] ?? null;
}

function externalMediaMimeType(name: string, mimeType: string) {
  if (SUPPORTED_MEDIA_TYPES.has(mimeType.toLowerCase())) return mimeType.toLowerCase();
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    mov: "video/quicktime",
    mp4: "video/mp4",
  };
  return types[extension] ?? mimeType;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function positiveNumberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function millisecondsToSeconds(value: unknown) {
  const milliseconds = positiveNumberOrNull(value);
  return milliseconds === null ? null : milliseconds / 1000;
}

function dropboxParentPath(path: string | null) {
  if (!path) return null;
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}
