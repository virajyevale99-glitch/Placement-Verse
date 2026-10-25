// The ONLY two administrator identities. There is no registration flow.
// Both share the fixed password defined in ./password.ts.

export interface AdminIdentity {
  id: string; // matches Admins.admin_id in the spreadsheet
  username: string; // what they type on the login form
  displayName: string;
}

export const ADMINS: readonly AdminIdentity[] = [
  { id: 'adm_viraj', username: 'viraj', displayName: 'Viraj Yevale' },
  { id: 'adm_uditi', username: 'uditi', displayName: 'Uditi' },
] as const;

export function findAdminByUsername(username: string): AdminIdentity | undefined {
  const u = username.trim().toLowerCase();
  return ADMINS.find((a) => a.username === u);
}

export function findAdminById(id: string): AdminIdentity | undefined {
  return ADMINS.find((a) => a.id === id);
}
