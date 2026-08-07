import { corsHeaders, json, staffContext } from "../_shared/outlook.ts";

type CrmAccount = {
  id: string;
  business_name: string;
  email: string | null;
  stage: string;
  assigned_to: string | null;
  linked_workspace_id: string | null;
};

type RecipientResult = {
  id: string;
  accountId: string | null;
  name: string;
  business?: string;
  email: string;
  type: string;
};

type StaffDirectoryRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  staff_type: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await staffContext(request);
    if (!auth) return json({ error: "not_authenticated" }, 401);
    const { user, db } = auth;

    const { data: roles } = await db.from("user_roles").select("role,staff_type").eq("user_id", user.id);
    const owner = (roles ?? []).some((role: { role: string }) => role.role === "dream_wave_owner");
    const mediaManager = (roles ?? []).some(
      (role: { role: string; staff_type?: string }) =>
        role.role === "dream_wave_team" && role.staff_type === "media_manager",
    );

    let accountsQuery = db
      .from("crm_accounts")
      .select("id,business_name,email,stage,assigned_to,linked_workspace_id")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (!owner) accountsQuery = accountsQuery.eq("assigned_to", user.id);
    const { data: accounts } = await accountsQuery;
    const accountIds = (accounts ?? []).map((account: { id: string }) => account.id);
    const { data: contacts } = accountIds.length
      ? await db
          .from("crm_contacts")
          .select("id,account_id,first_name,last_name,email,is_primary")
          .in("account_id", accountIds)
      : { data: [] };

    const typedAccounts = (accounts ?? []) as CrmAccount[];
    const byAccount = new Map<string, CrmAccount>(
      typedAccounts.map((account) => [account.id, account]),
    );
    const results: RecipientResult[] = [
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
      const { data: clientContacts } = await db
        .from("client_contact_preferences")
        .select("workspace_id,contact_email,workspaces(name)")
        .not("contact_email", "is", null);
      for (const contact of clientContacts ?? []) {
        if (!contact.contact_email) continue;
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

    const { data: staffDirectory } = await db.rpc("get_staff_forward_directory");
    for (const member of (staffDirectory ?? []) as StaffDirectoryRow[]) {
      if (!member.email || member.user_id === user.id) continue;
      const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || member.email;
      const roleLabel =
        member.role === "dream_wave_owner"
          ? "Admin"
          : member.staff_type === "media_manager"
            ? "Media Manager"
            : "Sales";
      results.push({
        id: `staff:${member.user_id}`,
        accountId: null,
        name,
        business: "Dream Wave Media",
        email: member.email,
        type: `Staff · ${roleLabel}`,
      });
    }

    const unique = Array.from(
      new Map(results.map((item) => [item.email.toLowerCase(), item])).values(),
    );
    return json({ contacts: unique });
  } catch (error) {
    console.error(error);
    return json({ error: "outlook_contacts_failed" }, 500);
  }
});