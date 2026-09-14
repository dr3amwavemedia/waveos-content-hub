import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Destination = { to: string; hash?: string; label: string };

function explanation(item: Destination) {
  if (/invoice|payment/i.test(item.label))
    return "Find your invoices, payment details and recorded payment status here.";
  if (/contract/i.test(item.label))
    return "Review your agreements and open available signing or signed-document links here.";
  if (/deliver/i.test(item.label))
    return "Find your photos, videos and project delivery links here. Open a photo to view it full size.";
  if (/production/i.test(item.label))
    return "Browse upcoming, current and past projects. Open a project for its details and minimize it when finished.";
  if (/crm/i.test(item.label))
    return "Manage leads and follow-ups. Creating a client profile does not send an invitation automatically.";
  if (/client/i.test(item.label))
    return "Open a client's name to review their profile and access the available account tools.";
  if (/project/i.test(item.label))
    return "Open your available projects to see their details and updates.";
  return `Use ${item.label} from your menu whenever you need it. On a phone, the menu and bottom shortcuts keep your workspace close at hand.`;
}

/** A user/workspace-scoped guide; completion never changes service access. */
export function WorkspaceTour({
  storageKey,
  destinations,
}: {
  storageKey: string;
  destinations: Destination[];
}) {
  const steps = destinations.filter(
    (item, index, items) =>
      items.findIndex((other) => other.to === item.to && other.hash === item.hash) === index,
  );
  const [progress, setProgress] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return {
        step: Number.isInteger(saved?.step)
          ? Math.max(0, Math.min(saved.step, steps.length - 1))
          : 0,
        done: saved?.done === true,
      };
    } catch {
      return { step: 0, done: false };
    }
  });
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const index = Math.min(progress.step, steps.length - 1);
  const current = steps[index];
  function save(step: number, done = false) {
    const next = { step, done };
    setProgress(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Guide remains usable without browser storage. */
    }
  }
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {progress.done ? "Need a refresher?" : "A quick guide to your workspace"}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 px-2 text-sm font-semibold text-primary"
          onClick={() => {
            if (progress.done) save(0);
            setOpen(true);
          }}
        >
          {progress.done ? "Restart guide" : index ? "Continue guide" : "Get started"}
        </button>
        {!progress.done && (
          <button type="button" className="min-h-11 px-2 text-sm" onClick={() => save(index, true)}>
            Skip guide
          </button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-xl">
          <p className="text-xs text-muted-foreground">
            Step {index + 1} of {steps.length}
          </p>
          <DialogTitle>{current.label}</DialogTitle>
          <DialogDescription>{explanation(current)}</DialogDescription>
          <Link
            to={current.to}
            hash={current.hash}
            onClick={() => setOpen(false)}
            className="min-h-11 py-3 text-sm font-semibold text-primary"
          >
            Open {current.label}
          </Link>
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className="min-h-11 px-3 text-sm"
              onClick={() => {
                save(index, true);
                setOpen(false);
              }}
            >
              Skip guide
            </button>
            <button
              type="button"
              disabled={index === 0}
              className="min-h-11 rounded-lg border border-border px-3 text-sm disabled:opacity-40"
              onClick={() => save(index - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              onClick={() => {
                if (index === steps.length - 1) {
                  save(index, true);
                  setOpen(false);
                } else save(index + 1);
              }}
            >
              {index === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
