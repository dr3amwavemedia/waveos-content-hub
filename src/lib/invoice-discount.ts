export type InvoiceDiscountType = "none" | "fixed" | "percentage";

export function invoiceDiscount(input: {
  subtotalCents: number;
  type: InvoiceDiscountType;
  value: number;
}) {
  const subtotalCents = Math.max(0, Math.round(input.subtotalCents));
  const normalizedValue = Number.isFinite(input.value) ? Math.max(0, input.value) : 0;
  const discountCents =
    input.type === "fixed"
      ? Math.min(subtotalCents, Math.round(normalizedValue * 100))
      : input.type === "percentage"
        ? Math.min(
            subtotalCents,
            Math.round((subtotalCents * Math.min(100, normalizedValue)) / 100),
          )
        : 0;
  const storedValue =
    input.type === "fixed"
      ? Math.round(normalizedValue * 100)
      : input.type === "percentage"
        ? Math.round(normalizedValue * 100)
        : null;
  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    discountType: input.type === "none" ? null : input.type,
    discountValue: input.type === "none" ? null : storedValue,
  };
}

export function storedDiscountDisplay(
  type: string | null | undefined,
  value: number | null | undefined,
) {
  if (!type || value == null) return "";
  return (value / 100).toFixed(2);
}
