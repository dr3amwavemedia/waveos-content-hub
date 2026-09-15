import { useState } from "react";
import { useTemplates } from "./template-picker";
import { invoiceItemsFromJson, type DraftInvoiceItem } from "@/lib/invoice-items";

export function InvoiceItemPicker({
  onAdd,
  currency,
}: {
  onAdd: (item: DraftInvoiceItem) => void;
  currency: string;
}) {
  const q = useTemplates("invoice");
  const [search, setSearch] = useState("");
  const entries = (q.data ?? []).flatMap((template) =>
    invoiceItemsFromJson((template.body as { items?: unknown } | null)?.items).map((item, index) => ({
      item,
      template,
      index,
    })),
  );
  const filtered = entries.filter(({ item, template }) =>
    `${item.title ?? item.description} ${item.description} ${template.name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Add from DOCUMENTS</p>
      <p className="text-xs text-muted-foreground">
        Choose an item by title. Its full description and price are copied into this invoice.
        Item templates currently use USD.
      </p>
      {currency.toUpperCase() !== "USD" && (
        <p className="text-xs text-destructive">
          Change the invoice currency to USD before adding priced items.
        </p>
      )}
      <input
        type="search"
        aria-label="Search invoice items"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search item titles"
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading priced items…</p>
      ) : q.isError ? (
        <p className="text-xs text-destructive">
          Items could not load. Check the Documents migration and try again.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No priced items yet. Create an invoice item template in DOCUMENTS.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items match your search.</p>
      ) : (
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto">
          {filtered.map(({ item, template, index }) => (
            <button
              key={`${template.id}-${index}`}
              type="button"
              disabled={currency.toUpperCase() !== "USD"}
              onClick={() =>
                onAdd({
                  ...item,
                  templateId: template.id,
                  templateVersion: template.version,
                })
              }
              title={`Add ${item.title ?? item.description} from ${template.name}`}
              className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10"
            >
              + {item.title ?? item.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
