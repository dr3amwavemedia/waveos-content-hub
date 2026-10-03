export type ClientAccountAccess = "client_admin" | "client_second_account";

export type ClientWorkspaceRole = "owner" | "admin" | "editor" | "approver" | "viewer";

export function clientAccountAccess(role: string | null | undefined): ClientAccountAccess {
  return role === "owner" || role === "admin" ? "client_admin" : "client_second_account";
}

export function clientAccountAccessLabel(access: ClientAccountAccess): string {
  return access === "client_admin" ? "Client Admin" : "Client Second Account";
}

export function workspaceRoleForClientAccess(
  access: ClientAccountAccess,
): Extract<ClientWorkspaceRole, "admin" | "editor"> {
  return access === "client_admin" ? "admin" : "editor";
}

export function appRoleForClientAccess(
  access: ClientAccountAccess,
): "client_owner" | "client_viewer" {
  return access === "client_admin" ? "client_owner" : "client_viewer";
}

export function canViewClientFinancials(role: string | null | undefined): boolean {
  return clientAccountAccess(role) === "client_admin";
}
