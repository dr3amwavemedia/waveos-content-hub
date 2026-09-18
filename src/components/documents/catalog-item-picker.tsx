import { useState } from "react";
import { useCatalogItems } from "@/hooks/use-catalog";
import { moneyInputToCents, type DraftInvoiceItem } from "@/lib/invoice-items";
import {
  catalogLineDescription,
  pricingBadges,
  priceSummary,
  requiresFinalPrice,
  suggestedUnitCents,
  type BillingChoice,
  type CatalogItem,
} from "@/lib/catalog";

const inputCls =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/**
 * Adds 2026 price-sheet items to an invoice. Range and starting-at items
 * cannot be added until an authorized user types the final agreed amount.
 */
export function CatalogItemPicker({
  onAdd,
  currency,
}: {
  onAdd: (item: DraftInvoiceItem) => void;
  currency: string;
}) {
  const q = useCatalogItems(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingChoice>("monthly");
  const [finalPrice, setFinalPrice] = useState("");
  const usd = currency.toUpperCase() === "USD";

  const items = (q.data ?? []).filter((item) =>
    `${item.name} ${item.description ?? ""} ${item.category}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const add = (item: CatalogItem) => {
    const suggested = suggestedUnitCents(item, billing);
    const typed = finalPrice.trim() ? moneyInputToCents(finalPrice) : null;
    const unitCents = typed ?? suggested;
    if (unitCents === null) return;
    onAdd({
      title: item.name,
      description: catalogLineDescription(item, billing),
      quantity: item.quantity_default || 1,
      unitCents,
    });
    setSelectedId(null);
    setFinalPrice("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Add from the 2026 price list</p>
      <p className="text-xs text-muted-foreground">
        Each item is added once with its own wording. Ranges and starting-at items need the final
        agreed amount first. Price list amounts are in USD.
      </p>
      {!usd && (
        <p className="text-xs text-destructive">
          Change the invoice currency to USD before adding price list items.
        </p>
      )}
      <input
        type="search"
        aria-label="Search the price list"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search packages and services"
        className={inputCls}
      />
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading the price list…</p>
      ) : q.isError ? (
        <p className="text-xs text-destructive">The price list could not load. Try again.</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No price list items match your search.</p>
      ) : (
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!usd}
              aria-pressed={selectedId === item.id}
              onClick={() => {
                setSelectedId(selectedId === item.id ? null : item.id);
                setFinalPrice("");
              }}
              title={priceSummary(item)}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10 ${
                selectedId === item.id ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{selected.name}</span>
            {pricingBadges(selected).map((badge) => (
              <span
                key={badge}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary"
              >
                {badge}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{priceSummary(selected)}</p>
          {selected.price_note && (
            <p className="text-xs text-muted-foreground">{selected.price_note}</p>
          )}
          {selected.pricing_type === "monthly_or_annual" && (
            <div role="group" aria-label="Billing choice" className="flex gap-2">
              {(["monthly", "annual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={billing === option}
                  onClick={() => setBilling(option)}
                  className={`min-h-9 rounded-lg border px-3 text-xs ${
                    billing === option ? "border-primary text-primary" : "border-border"
                  }`}
                >
                  {option === "monthly" ? "Billed monthly" : "Billed annually"}
                </button>
              ))}
            </div>
          )}
          <label className="block text-xs text-muted-foreground">
            {requiresFinalPrice(selected) ? "Final agreed price (required)" : "Override price"}
            <input
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              inputMode="decimal"
              placeholder="1250.00"
              className={inputCls}
            />
          </label>
          {finalPrice.trim() && moneyInputToCents(finalPrice) === null && (
            <p className="text-xs text-destructive">Enter an amount such as 1250.00.</p>
          )}
          {requiresFinalPrice(selected) && !finalPrice.trim() && (
            <p className="text-xs text-destructive">
              This item is quoted individually. Add the agreed amount before it can go on an
              invoice.
            </p>
          )}
          {selected.document_templates && (
            <p className="text-xs text-muted-foreground">
              Linked agreement: {selected.document_templates.name}
            </p>
          )}
          <button
            type="button"
            disabled={
              !usd ||
              (finalPrice.trim()
                ? moneyInputToCents(finalPrice) === null
                : suggestedUnitCents(selected, billing) === null)
            }
            onClick={() => add(selected)}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add to invoice
          </button>
        </div>
      )}
    </div>
  );
}
