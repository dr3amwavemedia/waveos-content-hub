import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/external-media/$assetId")({
  server: {
    handlers: {
      GET: ({ request, params }) => relayExternalMedia(request, params.assetId, false),
      HEAD: ({ request, params }) => relayExternalMedia(request, params.assetId, true),
    },
  },
});

async function relayExternalMedia(request: Request, assetId: string, headOnly: boolean) {
  const url = new URL(request.url);
  const thumbnailOnly = url.searchParams.get("preview") === "thumbnail";
  const expires = url.searchParams.get("expires") ?? "";
  const signature = url.searchParams.get("signature") ?? "";
  const { verifyExternalRelay, getExternalConnection, externalAccessToken } = await import(
    "@/lib/external-media.server"
  );
  if (!(await verifyExternalRelay(assetId, expires, signature)))
    return new Response("unauthorized", { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: asset } = await supabaseAdmin
    .from("media_assets")
    .select("id,workspace_id,name,mime_type,size_bytes,source_provider,external_file_id,thumbnail_url")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset || asset.source_provider !== "google_drive" || !asset.external_file_id)
    return new Response("not_found", { status: 404 });
  const headers = new Headers({
    "Content-Type": asset.mime_type || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  if (asset.size_bytes > 0) headers.set("Content-Length", String(asset.size_bytes));
  if (headOnly) return new Response(null, { status: 200, headers });

  const connection = await getExternalConnection(asset.workspace_id, "google_drive");
  if (!connection) return new Response("connection_required", { status: 409 });
  const accessToken = await externalAccessToken(connection);
  if (thumbnailOnly) {
    let thumbnailLink = asset.thumbnail_url;
    if (!thumbnailLink) {
      const metadataResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(asset.external_file_id)}?fields=thumbnailLink`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const metadata = (await metadataResponse.json().catch(() => ({}))) as {
        thumbnailLink?: string;
      };
      if (!metadataResponse.ok || !metadata.thumbnailLink)
        return new Response("thumbnail_unavailable", { status: 404 });
      thumbnailLink = metadata.thumbnailLink;
    }
    const thumbnailResponse = await fetch(thumbnailLink, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!thumbnailResponse.ok || (!headOnly && !thumbnailResponse.body))
      return new Response("thumbnail_unavailable", { status: 502 });
    const thumbnailHeaders = new Headers({
      "Content-Type": thumbnailResponse.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=1800",
    });
    const thumbnailLength = thumbnailResponse.headers.get("content-length");
    if (thumbnailLength) thumbnailHeaders.set("Content-Length", thumbnailLength);
    return new Response(headOnly ? null : thumbnailResponse.body, {
      status: 200,
      headers: thumbnailHeaders,
    });
  }
  const providerResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(asset.external_file_id)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(request.headers.get("range") ? { Range: request.headers.get("range")! } : {}),
      },
    },
  );
  if (!providerResponse.ok || !providerResponse.body)
    return new Response("provider_unavailable", { status: 502 });
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = providerResponse.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(providerResponse.body, {
    status: providerResponse.status,
    headers,
  });
}
