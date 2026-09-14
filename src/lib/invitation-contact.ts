type Contact = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  is_primary?: boolean;
};

export function invitationContact(
  account: {
    email?: string | null;
    crm_contacts?: Contact[] | null;
  } | null,
) {
  const contacts = account?.crm_contacts ?? [];
  const contact = contacts.find((item) => item.is_primary) ?? contacts[0];
  return {
    email: (contact?.email?.trim() || account?.email?.trim() || "").toLowerCase(),
    firstName: contact?.first_name?.trim() || "",
    lastName: contact?.last_name?.trim() || "",
  };
}
