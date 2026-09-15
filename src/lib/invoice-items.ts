import type { InvoiceLineItem } from "./invoice-document";

export type DraftInvoiceItem = InvoiceLineItem & {
  templateId?: string;
  templateVersion?: number;
};

export function invoiceItemTotal(items: InvoiceLineItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitCents, 0);
}

export function validInvoiceItems(items: InvoiceLineItem[]): boolean {
  return (
    items.every(
      (item) =>
        (item.title === undefined || item.title.trim().length > 0) &&
        item.description.trim().length > 0 &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        Number.isSafeInteger(item.unitCents) &&
        item.unitCents >= 0,
    ) && Number.isSafeInteger(invoiceItemTotal(items))
  );
}

export function invoiceItemsFromJson(value: unknown): DraftInvoiceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const description = String(item.description ?? "").trim();
    const title = typeof item.title === "string" ? item.title.trim() : undefined;
    const quantity = Number(item.quantity);
    const unitCents = Number(item.unitCents);
    const normalized: DraftInvoiceItem = {
      ...(title ? { title } : {}),
      description,
      quantity,
      unitCents,
      ...(typeof item.templateId === "string" ? { templateId: item.templateId } : {}),
      ...(typeof item.templateVersion === "number" && Number.isSafeInteger(item.templateVersion)
        ? { templateVersion: item.templateVersion }
        : {}),
    };
    return validInvoiceItems([normalized]) ? [normalized] : [];
  });
}

export function moneyInputToCents(value: string): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars, decimals = ""] = value.trim().split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
