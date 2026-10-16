import { invoiceItemsFromJson, invoiceItemTotal, type DraftInvoiceItem } from './invoice-items.ts';
export type ScopeInvoice = {
  id?: string; number: string | null; line_items: unknown; description: string | null;
  amount_cents: number | null; currency: string; due_at: string | null;
  discount_type: string | null; discount_value: number | null;
  checkout_payment_cents: number | null; checkout_payment_type: string; payment_plan: string;
};
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100);
export function serviceScope(items: DraftInvoiceItem[], currency: string) {
  return items.map(item=>`${item.title || item.description}\n${item.description}\n${item.quantity} × ${money(item.unitCents,currency)} = ${money(item.quantity*item.unitCents,currency)}`).join('\n\n');
}
export function invoiceScope(invoice: ScopeInvoice): string {
  const items = invoiceItemsFromJson(invoice.line_items);
  const parts = [invoice.number ? `Invoice ${invoice.number}` : 'Linked invoice', serviceScope(items,invoice.currency) || invoice.description || 'Services not listed on invoice'];
  if(invoice.discount_type && invoice.discount_value !== null) parts.push(`Discount: ${invoice.discount_type === 'percentage' ? `${invoice.discount_value/100}%` : money(invoice.discount_value,invoice.currency)}`);
  parts.push(`Total: ${money(invoice.amount_cents ?? invoiceItemTotal(items),invoice.currency)}`);
  if(invoice.checkout_payment_cents !== null)parts.push(`Required ${invoice.checkout_payment_type.replaceAll('_',' ')}: ${money(invoice.checkout_payment_cents,invoice.currency)}`);
  parts.push(`Payment plan: ${invoice.payment_plan.replaceAll('_',' ')}`);
  if(invoice.due_at)parts.push(`Due: ${invoice.due_at.slice(0,10)}`);
  return parts.join('\n\n');
}
