import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { calculateSaaSMetrics, saasOwnerAllowed } from '@/lib/saas-metrics';

export const getSaaSDashboard = createServerFn({method: 'POST'})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const roles = await context.supabase.from('user_roles').select('role').eq('user_id',context.userId);
    if (roles.error || !saasOwnerAllowed((roles.data ?? []).map(r => r.role))) throw new Error('Owner access required.');
    const {supabaseAdmin} = await import('@/integrations/supabase/client.server');
    const workspaceResult = await supabaseAdmin.from('workspaces').select('id,name,created_at,status,is_archived,is_demo,data_source').eq('data_source','os_data').eq('is_demo',false);
    if (workspaceResult.error) throw new Error('SaaS workspace data is unavailable.');
    const workspaces = workspaceResult.data ?? [];
    const ids = workspaces.map(w => w.id);
    if (!ids.length) return {metrics: calculateSaaSMetrics([],[],[]), workspaces, lifecycle: [], invoiceAvailable: true, lifecycleAvailable: true, measuredAt: new Date().toISOString()};
    const [subscriptions,invoices,lifecycle] = await Promise.all([
      supabaseAdmin.from('workspace_social_subscriptions').select('*').in('workspace_id',ids),
      supabaseAdmin.from('workspace_social_subscription_invoices').select('*').in('workspace_id',ids).order('created_at',{ascending:false}).limit(10000),
      supabaseAdmin.from('social_subscription_lifecycle').select('workspace_id,state,last_checked_at,last_error').in('workspace_id',ids),
    ]);
    if (subscriptions.error || (subscriptions.data?.length ?? 0) >= 1000 || workspaces.length >= 1000) throw new Error('SaaS reporting coverage needs review before totals can be shown.');
    const invoiceAvailable = !invoices.error && (invoices.data?.length ?? 0) < 1000;
    const metrics = calculateSaaSMetrics(workspaces,subscriptions.data ?? [],invoiceAvailable ? invoices.data ?? [] : []);
    return {metrics, workspaces, lifecycle: lifecycle.data ?? [], invoiceAvailable, lifecycleAvailable: !lifecycle.error, measuredAt: new Date().toISOString()};
  });