import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { moneyInputToCents } from "@/lib/invoice-items";
import { formatCents, pricingBadges, priceSummary } from "@/lib/catalog";
import { useCatalogItems, type CatalogItemWithTemplate } from "@/hooks/use-catalog";

export const Route = createFileRoute("/_authenticated/catalog")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isStaff = (roles ?? []).some(
      (r) => r.role === "dream_wave_owner" || r.role === "dream_wave_team",
    );
    if (!isStaff) throw redirect({ to: "/home" });
    return { isOwner: (roles ?? []).some((r) => r.role === "dream_wave_owner") };
  },
  component: CatalogPage,
  head: () => ({
    meta: [
      { title: "Price List — WaveOS" },
      {
        name: "description",
        content:
          "Dream Wave Media 2026 service catalog: retainers, commercial services and wedding packages with their linked agreements.",
      },
      { property: "og:title", content: "Price List — WaveOS" },
      {
        property: "og:description",
        content: "The 2026 Dream Wave Media service catalog and linked agreement templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const inputCls =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

const PRICING_LABELS: Record<string, string> = {
  fixed: "Fixed",
  hourly: "Hourly",
  monthly_or_annual: "Monthly / Annual",
  range: "Range",
  starting_at: "Starting at",
};

function CatalogPage() {
  const { isOwner } = Route.useRouteContext() as { isOwner: boolean };
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [itemType, setItemType] = useState("all");
  const [pricing, setPricing] = useState("all");
  const [editing, setEditing] = useState<CatalogItemWithTemplate | null>(null);
  const q = useCatalogItems(!showInactive);

  const categories = useMemo(
    () => [...new Set((q.data ?? []).map((i) => i.category))].sort(),
    [q.data],
  );
  const items = (q.data ?? []).filter((item) => {
    const term = search.trim().toLowerCase();
    const matchesTerm =
      !term ||
      `${item.name} ${item.description ?? ""} ${item.category}`.toLowerCase().includes(term);
    return (
      matchesTerm &&
      (category === "all" || item.category === category) &&
      (itemType === "all" || item.item_type === itemType) &&
      (pricing === "all" || item.pricing_type === pricing)
    );
  });

  return (
    <AppShell>
      <div className="w-full space-y-8">
        <header className="border-b border-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Price list</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The 2026 Dream Wave Media service sheet. Every item defaults to a quantity of one, and
            ranges or starting-at prices need a final agreed amount before a quote can be sent.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            aria-label="Search the price list"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or wording"
            className={inputCls}
          />
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by type"
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className={inputCls}
          >
            <option value="all">Packages and services</option>
            <option value="package">Packages only</option>
            <option value="service">Services only</option>
          </select>
          <select
            aria-label="Filter by pricing"
            value={pricing}
            onChange={(e) => setPricing(e.target.value)}
            className={inputCls}
          >
            <option value="all">All pricing</option>
            {Object.entries(PRICING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show retired items
        </label>

        {editing && (
          <CatalogEditor
            key={editing.id}
            item={editing}
            onDone={() => setEditing(null)}
          />
        )}

        {q.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : q.isError ? (
          <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            The price list could not load: {errorMessage(q.error, "Try again.")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items match these filters.</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border/60 bg-background/60 p-5"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                    {!item.active && (
                      <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                        retired
                      </span>
                    )}
                    {pricingBadges(item).map((badge) => (
                      <span
                        key={badge}
                        className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                  <p className="text-sm font-medium text-foreground">{priceSummary(item)}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                  {item.price_note && (
                    <p className="text-xs text-muted-foreground">{item.price_note}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Default quantity {item.quantity_default}
                    {item.unit && item.unit !== "starting_at" ? ` · per ${item.unit}` : ""} ·{" "}
                    {item.document_templates
                      ? `Agreement: ${item.document_templates.name}`
                      : "No linked agreement"}
                  </p>
                </div>
                {isOwner && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setEditing(editing?.id === item.id ? null : item)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                    >
                      {editing?.id === item.id ? (
                        <>
                          <X className="h-3.5 w-3.5" /> Close
                        </>
                      ) : (
                        <>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </>
                      )}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Source: FULL SERVICE BREAKDOWN PRICE SHEET 2026. Taxes, travel, add-ons, overtime and
          third-party costs are not included unless added separately.
        </p>
      </div>
    </AppShell>
  );
}

/** Owner-only edit form. Amounts are entered in dollars and stored as whole cents. */
function CatalogEditor({ item, onDone }: { item: CatalogItemWithTemplate; onDone: () => void }) {
  const qc = useQueryClient();
  const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(dollars(item.price_cents));
  const [monthly, setMonthly] = useState(dollars(item.monthly_price_cents));
  const [annual, setAnnual] = useState(dollars(item.annual_price_cents));
  const [minimum, setMinimum] = useState(dollars(item.minimum_price_cents));
  const [maximum, setMaximum] = useState(dollars(item.maximum_price_cents));
  const [active, setActive] = useState(item.active);

  const save = useMutation({
    mutationFn: async () => {
      const money = (value: string) => {
        if (!value.trim()) return null;
        const cents = moneyInputToCents(value);
        if (cents === null) throw new Error("Enter prices as plain amounts such as 1250.00.");
        return cents;
      };
      if (!name.trim()) throw new Error("Give the item a name.");
      const { error } = await supabase
        .from("catalog_items")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          price_cents: money(price),
          monthly_price_cents: money(monthly),
          annual_price_cents: money(annual),
          minimum_price_cents: money(minimum),
          maximum_price_cents: money(maximum),
          active,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Price list item updated.");
      await qc.invalidateQueries({ queryKey: ["catalog-items"] });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save this item.")),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <p className="text-sm font-semibold text-foreground">Editing {item.name}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="What is included"
        className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Price
          <input value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted-foreground">
          Monthly
          <input value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted-foreground">
          Annual
          <input value={annual} onChange={(e) => setAnnual(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted-foreground">
          Range low
          <input value={minimum} onChange={(e) => setMinimum(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs text-muted-foreground">
          Range high
          <input value={maximum} onChange={(e) => setMaximum(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Available on quotes
      </label>
      <p className="text-xs text-muted-foreground">
        Monthly and annual options are shown separately and are never added together. Current
        stored total for reference: {formatCents(item.price_cents)}.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save changes
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-lg border border-border px-4 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
