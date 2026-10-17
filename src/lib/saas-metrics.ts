import type { Database } from '@/integrations/supabase/types';

export type SaaSSubscription = Database['public']['Tables']['workspace_social_subscriptions']['Row'];
export type SaaSInvoice = Database['public']['Tables']['workspace_social_subscription_invoices']['Row'];
export type SaaSWorkspace = Pick<Database['public']['Tables']['workspaces']['Row'], 'id' | 'name' | 'created_at' | 'status' | 'is_archived' | 'is_demo' | 'data_source'>;
export const saasOwnerAllowed = (roles: string[]) => roles.includes('dream_wave_owner');

export function calculateSaaSMetrics(workspaces: SaaSWorkspace[], subscriptions: SaaSSubscription[], invoices: SaaSInvoice[], now = new Date()) {
  const ids = new Set(workspaces.filter(w => w.data_source === 'os_data' && !w.is_demo).map(w => w.id));
  const real = subscriptions.filter(s => ids.has(s.workspace_id) && !s.internal_test_access && !!s.stripe_subscription_id);
  const subscriptionIds = new Set(real.map(s => s.stripe_subscription_id));
  const billing = invoices.filter(i => ids.has(i.workspace_id) && !!i.stripe_subscription_id && subscriptionIds.has(i.stripe_subscription_id));
  const paidActive = real.filter(s => s.status === 'active' && !s.service_locked_at);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const revenue: Record<string, number> = {};
  for (const i of billing.filter(i => i.status === 'paid')) revenue[i.currency.toUpperCase()] = (revenue[i.currency.toUpperCase()] ?? 0) + i.amount_paid_cents;
  const timeline = Array.from({length: 6}, (_, index) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const amounts: Record<string, number> = {};
    for (const i of billing.filter(i => i.status === 'paid' && new Date(i.stripe_created_at ?? i.created_at) >= start && new Date(i.stripe_created_at ?? i.created_at) < end)) amounts[i.currency.toUpperCase()] = (amounts[i.currency.toUpperCase()] ?? 0) + i.amount_paid_cents;
    return { month: start.toISOString().slice(0,7), workspaces: workspaces.filter(w => ids.has(w.id) && new Date(w.created_at) < end).length, revenue: amounts };
  });
  return {
    subscriptions: real, billing, activeSubscribers: paidActive.length,
    trials: real.filter(s => s.status === 'trialing').length,
    pastDue: real.filter(s => s.status === 'past_due' || s.payment_failure_count > 0).length,
    scheduledCancellations: real.filter(s => s.cancel_at_period_end).length,
    canceledRecords: real.filter(s => s.status === 'canceled').length,
    newRecords: real.filter(s => new Date(s.created_at) >= monthStart).length,
    activeWorkspaces: workspaces.filter(w => ids.has(w.id) && w.status === 'active' && !w.is_archived).length,
    planMix: ['standard','full','expanded'].map(plan => ({plan, count: paidActive.filter(s => s.plan === plan).length})),
    revenue, timeline,
  };
}