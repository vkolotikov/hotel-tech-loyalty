/**
 * Top-level folders under src/ that draw with tokens of their own and keep
 * their own sweeps: the member portal (p-*), the Appointments and Content
 * workspaces and the shared workspace core (Atelier a-*). The full admin's
 * style sweeps skip exactly these, from this one list (theme/ownTokenDirs.test.ts).
 */
export const OWN_TOKEN_DIRS: readonly string[] = ['portal', 'appointments', 'workspace', 'content']
