import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type CrmAccount = {
  id: string;
  business_name: string;
  email: string | null;
  stage: string;
  assigned_to: string | null;
  linked_workspace_id: string | null;
};

export const Route = createFileRoute("/api/outlook/contacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { outlookDb, requireOutlookStaff } = await import("@/lib/outlook.server");
        const user = await requireOutlookStaff(request);
        if (!user) return json({ error: "not_authenticated" }, 401);
        const { data: roles } = await outlookDb
          .from("user_roles")
          .select("role,staff_type")
          .eq("user_id", user.id);
        const owner = (roles ?? []).some(
          (role: { role: string }) => role.role === "dream_wave_owner",
        );
        const mediaManager = (roles ?? []).some(
          (role: { role: string; staff_type?: string }) =>
            role.role === "dream_wave_team" && role.staff_type === "media_manager",
        );

        let accountsQuery = outlookDb
          .from("crm_accounts")
          .select("id,business_name,email,stage,assigned_to,linked_workspace_id")
          .is("archived_at", null)
          .order("updated_at", { ascending: false });
        if (!owner) accountsQuery = accountsQuery.eq("assigned_to", user.id);
        const { data: accounts } = await accountsQuery;
        const accountIds = (accounts ?? []).map((account: { id: string }) => account.id);
        const { data: contacts } = accountIds.length
          ? await outlookDb
              .from("crm_contacts")
              .select("id,account_id,first_name,last_name,email,is_primary")
              .in("account_id", accountIds)
          : { data: [] };
        const typedAccounts = (accounts ?? []) as CrmAccount[];
        const byAccount = new Map<string, CrmAccount>(
          typedAccounts.map((account) => [account.id, account]),
        );
        const results = [
          ...typedAccounts
            .filter((account): account is CrmAccount & { email: string } => Boolean(account.email))
            .map((account) => ({
              id: `account:${account.id}`,
              accountId: account.id,
              name: account.business_name,
              email: account.email,
              type: account.stage === "won" ? "Client" : "Lead",
            })),
          ...(contacts ?? [])
            .filter((contact: { email?: string | null }) => contact.email)
            .map(
              (contact: {
                id: string;
                account_id: string;
                first_name: string;
                last_name?: string;
                email: string;
              }) => ({
                id: `contact:${contact.id}`,
                accountId: contact.account_id,
                name: `${contact.first_name} ${contact.last_name ?? ""}`.trim(),
                business: byAccount.get(contact.account_id)?.business_name,
                email: contact.email,
                type:
                  byAccount.get(contact.account_id)?.stage === "won"
                    ? "Client contact"
                    : "Lead contact",
              }),
            ),
        ];

        if (owner || mediaManager) {
          const { data: clientContacts } = await outlookDb
            .from("client_contact_preferences")
            .select("workspace_id,contact_email,workspaces(name)")
            .not("contact_email", "is", null);
          for (const contact of clientContacts ?? []) {
            const workspace = Array.isArray(contact.workspaces)
              ? contact.workspaces[0]
              : contact.workspaces;
            results.push({
              id: `workspace:${contact.workspace_id}:${contact.contact_email}`,
              accountId: null,
              name: workspace?.name ?? "Client",
              email: contact.contact_email,
              type: "Client contact",
            });
          }
        }
        const unique = Array.from(
          new Map(results.map((item) => [item.email.toLowerCase(), item])).values(),
        );
        return json({ contacts: unique });
      },
    },
  },
});
