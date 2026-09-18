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
import { openWorkspaceTour, WorkspaceTour } from "../../src/components/app/workspace-tour";
import { DocumentDraftTools } from "../../src/components/app/document-draft-tools";
import "../../src/styles.css";
import { PlanningChecklistControls } from "../../src/components/production/planning-checklist-controls";
import { CrewPlanControls } from "../../src/components/production/crew-plan-controls";
import { GallerySwipeSurface } from "../../src/components/deliveries/gallery-swipe-surface";
import { InvoiceExportTools } from "../../src/components/app/invoice-export-tools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeliveryGallery } from "../../src/components/deliveries/delivery-gallery";

function GalleryFixture() {
  const [client] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const assets = [1, 2].map((id) => ({
      id: `photo-${id}`,
      workspace_id: "synthetic",
      name: id === 1 ? "VeryLongClientPhotoFilename".repeat(12) + ".jpg" : "Second photo.jpg",
      mime_type: "image/jpeg",
      storage_path: null,
      source_provider: "frameio",
      thumbnail_url: null,
    }));
    cache.setQueryData(["your-content", "gallery", "synthetic", "", "all"], {
      pages: [assets],
      pageParams: [0],
    });
    const preview =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#227b83"/></svg>',
      );
    for (const asset of assets)
      for (const mode of ["thumbnail", "content"])
        cache.setQueryData(
          ["media", "delivery-preview", "synthetic", asset.id, null, "frameio", mode],
          preview,
        );
    return cache;
  });
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-5xl p-3">
        <DeliveryGallery workspaceId="synthetic" name="Synthetic client collection" />
      </main>
    </QueryClientProvider>
  );
}

function PlanningTools() {
  const [notes, setNotes] = useState("Original equipment notes\n- [ ] Camera\n- [x] Lens");
  const [crew, setCrew] = useState(
    'Original crew notes\nCrew: {"name":"Alex","role":"Producer","reportsTo":"","responsibilities":"Lead the project"}',
  );
  const [photo, setPhoto] = useState(1);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-3">
      <PlanningChecklistControls value={notes} onChange={setNotes} disabled={false} />
      <pre data-testid="checklist-source" className="whitespace-pre-wrap break-words">
        {notes}
      </pre>
      <CrewPlanControls value={crew} onChange={setCrew} disabled={false} />
      <pre data-testid="crew-source" className="whitespace-pre-wrap break-words">
        {crew}
      </pre>
      <GallerySwipeSurface
        onNext={() => setPhoto((n) => Math.min(3, n + 1))}
        onPrevious={() => setPhoto((n) => Math.max(1, n - 1))}
      >
        <div data-testid="swipe-photo" className="h-40 bg-surface">
          Photo {photo}
        </div>
        <video data-testid="swipe-video" controls />
      </GallerySwipeSurface>
      <InvoiceExportTools
        invoices={[
          {
            id: "sample",
            number: "INV-1",
            description: "Services",
            amount_cents: 10000,
            amount_paid_cents: 2500,
            currency: "USD",
            status: "deposit",
            issued_at: "2026-09-14",
            due_at: null,
            paid_at: null,
          },
        ]}
      />
    </main>
  );
}

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
    <main className="mx-auto max-w-5xl p-3">
      <WorkspaceTour
        storageKey="waveos.synthetic.guide"
        audience="your projects"
        destinations={[
          { to: "/tools", label: "Invoices", hash: "invoices" },
          { to: "/tools", label: "Contracts", hash: "contracts" },
        ]}
      />
      <button type="button" onClick={openWorkspaceTour}>
        Open guide from settings
      </button>
      <DocumentDraftTools />
      <Link to="/other">Leave tools</Link>
    </main>
  ),
});
const planning = createRoute({
  getParentRoute: () => root,
  path: "/planning",
  component: PlanningTools,
});
const gallery = createRoute({
  getParentRoute: () => root,
  path: "/gallery-fixture",
  component: GalleryFixture,
});
const router = createRouter({
  routeTree: root.addChildren([project, other, tools, planning, gallery]),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
