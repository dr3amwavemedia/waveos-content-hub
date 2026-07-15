import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWorkspacesTool from "./tools/list-workspaces";
import listContentTool from "./tools/list-content";
import createContentDraftTool from "./tools/create-content-draft";
import listMediaTool from "./tools/list-media";
import scheduleContentTool from "./tools/schedule-content";

// The OAuth issuer MUST be the direct Supabase host (RFC 8414 issuer must
// match the discovery doc). Build it from the project ref that Vite inlines
// at build time. The sentinel fallback keeps the string well-formed during
// the throwaway manifest-extract eval; real tokens never verify against it.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "waveos-mcp",
  title: "WaveOS",
  version: "0.1.0",
  instructions:
    "Tools for WaveOS Brand Workspaces. Use `list_workspaces` first to discover the caller's workspaces, then use the workspace id with `list_content`, `list_media_assets`, `create_content_draft`, and `schedule_content`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listWorkspacesTool,
    listContentTool,
    createContentDraftTool,
    listMediaTool,
    scheduleContentTool,
  ],
});
