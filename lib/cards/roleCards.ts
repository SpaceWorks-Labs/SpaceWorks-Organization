/*
 * Settings → Cards lists every member role with whether it has its own card: the owner chooses which
 * roles get one, and every other member carries the organisation's card. Pure, so a view can build
 * the list from rows it has already loaded (`loadRoleCardRows` in lib/cards/data.ts loads them).
 */

/**
 * - `organisation`: no design of its own; members with this role carry the organisation's card.
 * - `draft`: a design is waiting for the owner's first approval; cards still use the organisation's.
 * - `approved`: the role's own design is live.
 * - `changes`: the role's design is live and changes to it are waiting for approval.
 */
type RoleCardStatus = "organisation" | "draft" | "approved" | "changes";

type RoleCardRow = {
  roleId: string;
  name: string;
  /** True once the role's own design is live (approved). */
  ownDesign: boolean;
  status: RoleCardStatus;
  /** The role's card number pattern, when its own design is live; else the organisation's numbers apply. */
  numberFormat: string | null;
  /** Live cards of members whose primary role this is. */
  liveCards: number;
};

type RoleInput = { id: string; name: string };
type DesignInput = { roleId: string | null; live: boolean; hasDraft: boolean; numberFormat: string };

/** One row per role, in the order given, with its design status and live card count. */
export function roleCardRows(roles: readonly RoleInput[], designs: readonly DesignInput[], liveCards: ReadonlyMap<string, number>): RoleCardRow[] {
  const byRole = new Map(designs.flatMap((design) => (design.roleId ? [[design.roleId, design] as const] : [])));
  return roles.map((role) => {
    const design = byRole.get(role.id);
    const status: RoleCardStatus = !design || (!design.live && !design.hasDraft) ? "organisation" : !design.live ? "draft" : design.hasDraft ? "changes" : "approved";
    return {
      roleId: role.id,
      name: role.name,
      ownDesign: Boolean(design?.live),
      status,
      numberFormat: design?.live ? design.numberFormat : null,
      liveCards: liveCards.get(role.id) ?? 0,
    };
  });
}
