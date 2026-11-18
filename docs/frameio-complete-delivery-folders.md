# Complete Frame.io delivery folders

## Reported regression

The Organic Skin Care client has a Frame.io link assigned as a deliverable, but WaveOS currently displays only a portion of the folder. The required result is that the client can browse every file and nested folder authorized by that assigned Frame.io share, with accurate counts and a clear indication if the provider cannot finish loading the collection.

## Confirmed code-level causes

1. `listFrameioShareFiles` requests `page_size=100` once and reads only the first response. It does not follow the Frame.io V4 `links.next` cursor for the share assets endpoint.
2. The client home deliberately renders `files.slice(0, 6)` without clearly distinguishing that strip from the complete delivery.
3. The server keeps only entries whose `type` is `file` and MIME type is JPEG, PNG, MP4 or QuickTime. Folders and all other delivery file types are silently omitted.
4. The current share listing does not recursively enumerate the children of a folder included in the share.

Adobe's Frame.io V4 documentation confirms that list responses are cursor-paginated with a maximum page size of 100, and that folders are hierarchical containers whose children may include folders, files and version stacks. A complete delivery therefore requires both pagination and bounded descendant traversal.

## Required enumeration behavior

1. Resolve the workspace's existing assigned Frame.io share exactly as today.
2. Page through all assets explicitly included in the share by following the provider-returned cursor link. Treat the cursor as opaque and guard against repeated cursors.
3. When an included asset is a folder, enumerate that folder's children page by page and recursively visit descendant folders.
4. Handle version stacks according to the supported Frame.io V4 response model so authorized versions are not silently lost or double-counted.
5. Never walk upward to a parent folder or sideways into siblings that are not descendants of an asset included in the assigned share.
6. Deduplicate by stable Frame.io resource ID, preserve each item's relative folder path and retain deterministic display order.
7. Compare loaded counts with provider totals where available. If a rate limit, reconnect requirement, invalid cursor or provider error prevents completion, return the loaded count and an explicit incomplete state rather than labeling the subset as the full folder.

## File and preview behavior

- Display all authorized files, not only four hard-coded media types.
- Provide native image/video/audio/PDF previews only where WaveOS can safely support them.
- Use a generic file tile and safe provider/open-download action for unsupported preview formats.
- Do not use a thumbnail as if it were the original file.
- Refresh short-lived Frame.io preview/download URLs when opened and never persist them as durable delivery URLs.
- Keep the existing Frame.io source URL and resource identifiers; do not copy provider originals into WaveOS merely to complete the listing.

## Client experience

### Dashboard preview

The client dashboard may show a six-item recent-media preview for speed, but it must say that it is a preview, show the total available count when known, and include a prominent **View complete delivery** action.

### Deliveries page

- Show the complete folder hierarchy or a clear flattened collection with folder breadcrumbs.
- Display total files, folders and currently loaded items.
- Support filename search and useful file-type/folder filters across the complete authorized result, not only the currently visible page.
- Load large collections progressively while continuing automatically or with an accessible **Load more** control.
- Preserve the current selection when another page fails and offer a retry from the failed cursor.
- Support phone and desktop without limiting the actual dataset to the number of visible tiles.

## Authorization boundaries

- Workspace members can list only the Frame.io source assigned to their current workspace.
- Server-side listing validates that every returned resource belongs to the assigned share or is a descendant of an included folder.
- No OAuth token, account-wide folder tree, unrelated project, parent folder or sibling folder is returned to the browser.
- Client access remains read-only unless a separate existing authorized action explicitly permits import.

## Acceptance tests

- Reconcile the reported Organic Skin Care share count and nested structure directly against Frame.io using read-only calls.
- A share with 101+ items returns every page.
- A shared folder containing nested folders returns every descendant exactly once.
- Mixed images, videos, PDFs, audio and unsupported files all appear with appropriate presentation/fallbacks.
- Duplicate filenames in different folders remain distinct.
- Dashboard preview shows six items plus the true total and complete-delivery link.
- Search and filters include results beyond the first provider page.
- A 429 uses bounded exponential backoff and never duplicates files.
- A stopped cursor, provider error or reconnect requirement produces an honest partial state and retry.
- Another workspace cannot request or infer the assigned folder, item IDs, counts or source URLs.

## Current-state status confirmed November 9, 2026

This issue is reproducible from the implementation design even before a live account comparison: the server reads one maximum-100-item page, folders are discarded, and the dashboard shows only six files. The exact Organic Skin Care provider count and hierarchy still require a read-only comparison against its assigned live Frame.io share.
