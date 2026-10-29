"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamMemberUnit } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { Dropdown } from "@/components/ui/field";
import type { TeamMemberRow, TeamRoleOption, TeamUnitOption } from "@/components/team/memberSummary";

/**
 * Where a staff member holds their role: one unit and everything under it, or the whole organisation. Only reaches
 * the viewer could give this person's role at are offered; the server checks again.
 */
export function MemberUnitScope({ organisationSlug, row, units, roleOptions, canGrantOrgWide }: {
  organisationSlug: string;
  row: TeamMemberRow;
  units: TeamUnitOption[];
  roleOptions: TeamRoleOption[];
  canGrantOrgWide: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const role = roleOptions.find((option) => option.id === row.roleId);
  const offerOrgWide = canGrantOrgWide && Boolean(role?.orgWide);
  const offered = role?.scoped ? units : [];
  const missing = row.unitId && !offered.some((unit) => unit.id === row.unitId) ? { id: row.unitId, name: row.unitName ?? "Another unit" } : null;
  const memberName = row.name ?? row.email ?? undefined;
  return (
    <Dropdown
      aria-label={memberName ? `What ${memberName} can see` : "What they can see"}
      value={row.unitId ?? ""}
      disabled={pending}
      className="w-auto min-w-[160px] max-w-[220px] py-2 text-sm"
      onChange={(e) => {
        const next = e.target.value || null;
        startTransition(async () => {
          const res = await setTeamMemberUnit({ organisationSlug, targetUserId: row.userId, unitId: next });
          if (!res.ok) {
            showToast(res.error, "error");
            return;
          }
          showToast(next ? "Access limited to that unit" : "Access set to the whole organisation", "success");
          router.refresh();
        });
      }}
    >
      {offerOrgWide || !row.unitId ? <option value="" disabled={!offerOrgWide}>Whole organisation</option> : null}
      {missing ? <option value={missing.id} disabled>{missing.name}</option> : null}
      {offered.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
    </Dropdown>
  );
}
