import type { Database } from "@/integrations/supabase/types";

export type CatalogItem = Database["public"]["Tables"]["catalog_items"]["Row"];

export type PricingType = "fixed" | "hourly" | "monthly_or_annual" | "range" | "starting_at";

/** Money is stored in whole cents; never use floating point for stored amounts. */
export function formatCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function pricingBadges(item: CatalogItem): string[] {
  switch (item.pricing_type) {
    case "monthly_or_annual":
      return ["Monthly / Annual"];
    case "range":
      return ["Range", "Final quote required"];
    case "starting_at":
      return ["Starting at", "Final quote required"];
    case "hourly":
      return ["Hourly"];
    default:
      return ["Fixed"];
  }
}

/** Range and starting-at pricing can never be added without an agreed amount. */
export function requiresFinalPrice(item: CatalogItem): boolean {
  return item.pricing_type === "range" || item.pricing_type === "starting_at";
}

export type BillingChoice = "monthly" | "annual";

/**
 * Suggested amount in cents for a catalog item. Returns null when an
 * authorized user must type the final agreed amount before it can be used.
 */
export function suggestedUnitCents(item: CatalogItem, billing: BillingChoice): number | null {
  if (item.pricing_type === "monthly_or_annual")
    return billing === "annual" ? item.annual_price_cents : item.monthly_price_cents;
  if (requiresFinalPrice(item)) return null;
  return item.price_cents;
}

export function priceSummary(item: CatalogItem): string {
  if (item.price_display) return item.price_display;
  if (item.pricing_type === "monthly_or_annual")
    return `${formatCents(item.monthly_price_cents)}/month or ${formatCents(item.annual_price_cents)}/year`;
  if (item.pricing_type === "range")
    return `${formatCents(item.minimum_price_cents)}–${formatCents(item.maximum_price_cents)}`;
  if (item.pricing_type === "starting_at") return `${formatCents(item.minimum_price_cents ?? item.price_cents)}+`;
  if (item.pricing_type === "hourly") return `${formatCents(item.price_cents)}/hour`;
  return formatCents(item.price_cents);
}

/** Line-item description copied onto quotes and invoices. */
export function catalogLineDescription(item: CatalogItem, billing: BillingChoice): string {
  const parts = [item.description ?? item.name];
  if (item.pricing_type === "monthly_or_annual")
    parts.push(billing === "annual" ? "Billed annually." : "Billed monthly.");
  if (item.unit && item.unit !== "starting_at") parts.push(`Unit: ${item.unit}.`);
  if (item.price_note) parts.push(item.price_note);
  return parts.filter(Boolean).join(" ");
}
