// Synthetic router fixture: no authentication, database, or network writes.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouter,
} from "@tanstack/react-router";
import { ProjectNavigationGuard } from "../../src/components/production/project-navigation-guard";
import { WorkspaceTour } from "../../src/components/app/workspace-tour";
import { DocumentDraftTools } from "../../src/components/app/document-draft-tools";

function Project() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  return (
    <main>
      <ProjectNavigationGuard dirty={value !== saved} />
      <h1>Project notes</h1>
      <label htmlFor="story">Story</label>
      <textarea id="story" value={value} onChange={(e) => setValue(e.target.value)} />
      <p role="status">{value !== saved ? "Unsaved changes" : "Saved"}</p>
      {error && <p role="alert">Synthetic save failure. Draft kept.</p>}
      <button
        onClick={() => {
          setSaved(value);
          setError(false);
        }}
      >
        Save successfully
      </button>
      <button onClick={() => setError(true)}>Fail save</button>
      <Link to="/other">Leave using a link</Link>
      <button onClick={() => router.navigate({ to: "/other" })}>Leave programmatically</button>
      <button onClick={() => router.history.back()}>Back</button>
      <button onClick={() => router.history.forward()}>Forward</button>
    </main>
  );
}
const root = createRootRoute({ component: () => <Outlet /> });
const project = createRoute({ getParentRoute: () => root, path: "/", component: Project });
const other = createRoute({
  getParentRoute: () => root,
  path: "/other",
  component: () => (
    <main>
      <h1>Other page</h1>
      <Link to="/">Open project</Link>
    </main>
  ),
});
const tools = createRoute({
  getParentRoute: () => root,
  path: "/tools",
  component: () => (
    <main>
      <WorkspaceTour
        storageKey="waveos.synthetic.guide"
        audience="your projects"
        destinations={[
          { to: "/tools", label: "Invoices", hash: "invoices" },
          { to: "/tools", label: "Contracts", hash: "contracts" },
        ]}
      />
      <DocumentDraftTools />
      <Link to="/other">Leave tools</Link>
    </main>
  ),
});
const router = createRouter({ routeTree: root.addChildren([project, other, tools]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
