export const DEFAULT_SERVICE_FEE_BASIS_POINTS = 290;

export function invoiceServiceFeeCents(
  amountAfterDiscountCents: number,
  basisPoints = DEFAULT_SERVICE_FEE_BASIS_POINTS,
) {
  const amount = Math.max(0, Math.round(amountAfterDiscountCents));
  const rate = Math.max(0, Math.round(basisPoints));
  return Math.round((amount * rate) / 10_000);
}

export function serviceFeePercentLabel(basisPoints: number | null | undefined) {
  return ((basisPoints ?? 0) / 100).toFixed(2).replace(/\.00$/, "");
}
