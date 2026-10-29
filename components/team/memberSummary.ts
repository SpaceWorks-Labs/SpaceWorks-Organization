/** Client-safe row for the team list. `email` is present only for viewers who manage the team. */
export type TeamMemberRow = {
  id: string;
  userId: string;
  name: string | null;
  email?: string | null;
  roleId: string;
  /** The staff role's name (`orgRole.name`). */
  roleName: string;
  isOwner: boolean;
  /** The unit they hold their role for; null for the whole organisation. */
  unitId: string | null;
  unitName: string | null;
  joinedLabel: string;
  isYou: boolean;
  /** Whether the viewer may change this person's role or unit, or remove them (the server checks again). */
  manageable: boolean;
};

/** A role the viewer may give, and at which reach: the whole organisation, one unit, or both. */
export type TeamRoleOption = { id: string; name: string; orgWide: boolean; scoped: boolean; /** How many permissions it holds. */ permissions: number };

export type TeamUnitOption = { id: string; name: string; level: number };

export type RoleCount = { id: string; name: string; isOwner: boolean; count: number };

/** "everyone", or one staff role's id. */
export type TeamFilter = "everyone" | (string & {});

/** "Manager · South" for a role held for one unit, "Manager" for the whole organisation. */
export function grantLabel(roleName: string, unitName: string | null | undefined) {
  return unitName ? `${roleName} · ${unitName}` : roleName;
}

/** "Owner 1 · Manager 2 · Viewer 3", skipping roles nobody holds. */
export function roleBreakdown(counts: RoleCount[]) {
  const parts = counts.filter((role) => role.count > 0).map((role) => `${role.name} ${role.count}`);
  return parts.length ? parts.join(" · ") : "No one yet";
}

const DOT_TONES = ["bg-highlight", "bg-info-solid", "bg-line-strong"];

/** The dot colour for a role: the Owner role's own, then a few tones in role order. */
function roleTone(counts: RoleCount[], roleId: string) {
  const index = counts.filter((role) => !role.isOwner).findIndex((role) => role.id === roleId);
  if (index < 0) return "bg-primary";
  return DOT_TONES[index % DOT_TONES.length];
}

/**
 * One dot per person, in role order. Above `cap` people the dots are shared out proportionally, keeping at least one
 * dot for every role someone holds. Returns a colour class per dot.
 */
export function roleDots(counts: RoleCount[], cap = 24): string[] {
  const held = counts.filter((role) => role.count > 0);
  const total = held.reduce((sum, role) => sum + role.count, 0);
  if (total === 0) return [];
  const slots = Math.max(Math.min(total, cap), held.length);
  const allocation = held.map((role) => Math.max(1, Math.round((role.count / total) * slots)));
  // Trim or pad the largest group so the total matches the slot count.
  let diff = allocation.reduce((sum, n) => sum + n, 0) - slots;
  while (diff !== 0) {
    const largest = allocation.indexOf(Math.max(...allocation));
    allocation[largest] += diff > 0 ? -1 : 1;
    diff += diff > 0 ? -1 : 1;
  }
  return held.flatMap((role, index) => Array.from({ length: allocation[index] }, () => roleTone(counts, role.id)));
}

export function matchesFilter(row: Pick<TeamMemberRow, "roleId">, filter: TeamFilter) {
  return filter === "everyone" || row.roleId === filter;
}

/** The role a new invite starts on: the one with the fewest permissions (ties keep role order), or "" if none. */
export function leastPrivilegedRole(options: TeamRoleOption[]) {
  return options.reduce<TeamRoleOption | null>((least, option) => (!least || option.permissions < least.permissions ? option : least), null)?.id ?? "";
}

/** Case-insensitive match on name, and on email only when the viewer was sent one. */
function matchesSearch(row: Pick<TeamMemberRow, "name" | "email">, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (row.name?.toLowerCase().includes(needle)) return true;
  return Boolean(row.email && row.email.toLowerCase().includes(needle));
}

export function filterTeam(rows: TeamMemberRow[], filter: TeamFilter, query: string) {
  return rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row, query));
}

export function firstName(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || null;
}
