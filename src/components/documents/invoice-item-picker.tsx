import { useTemplates } from "./template-picker";
import { invoiceItemsFromJson, type DraftInvoiceItem } from "@/lib/invoice-items";
import { formatMoney } from "@/lib/invoice-document";

export function InvoiceItemPicker({
  onAdd,
  currency,
}: {
  onAdd: (item: DraftInvoiceItem) => void;
  currency: string;
}) {
  const q = useTemplates("invoice");
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Add from DOCUMENTS</p>
      <p className="text-xs text-muted-foreground">
        Click a priced item to add it to this invoice. The saved invoice keeps a copy of its price
        and description. Item templates currently use USD.
      </p>
      {currency.toUpperCase() !== "USD" && (
        <p className="text-xs text-destructive">
          Change the invoice currency to USD before adding priced items.
        </p>
      )}
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading priced items…</p>
      ) : q.isError ? (
        <p className="text-xs text-destructive">
          Items could not load. Check the Documents migration and try again.
        </p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No priced items yet. Create an invoice item template in DOCUMENTS.
        </p>
      ) : (
        <div className="space-y-2">
          {q.data!.map((template) => {
            const items = invoiceItemsFromJson(
              (template.body as { items?: unknown } | null)?.items,
            );
            return items.length ? (
              <div key={template.id}>
                <p className="text-xs font-medium text-muted-foreground">
                  {template.name} · v{template.version}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {items.map((item, index) => (
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
                      className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-xs hover:border-primary hover:bg-primary/10"
                    >
                      <span className="block font-medium text-foreground">
                        + {item.description}
                      </span>
                      <span>
                        {item.quantity} × {formatMoney(item.unitCents, currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
