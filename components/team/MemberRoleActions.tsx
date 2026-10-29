"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTeamRole, removeTeamMember } from "@/app/actions/team";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Dropdown } from "@/components/ui/field";
import { grantLabel, type TeamMemberRow, type TeamRoleOption } from "@/components/team/memberSummary";

/** A staff member's role: a picker of the roles the viewer may give at this person's reach, and removal. */
export function MemberRoleActions({ organisationSlug, row, roleOptions }: {
  organisationSlug: string;
  row: TeamMemberRow;
  roleOptions: TeamRoleOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const memberName = row.name ?? row.email ?? undefined;

  if (!row.manageable) {
    return <Chip size="sm" tone={row.isOwner ? "ink" : "neutral"}>{grantLabel(row.roleName, row.unitName)}</Chip>;
  }

  const options = roleOptions.filter((option) => (row.unitId ? option.scoped : option.orgWide));
  const current = options.some((option) => option.id === row.roleId) ? null : { id: row.roleId, name: row.roleName };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        aria-label={memberName ? `Role for ${memberName}` : "Role"}
        value={row.roleId}
        disabled={pending}
        className="w-auto min-w-[120px] max-w-[200px] py-2 text-sm"
        onChange={(e) => {
          const roleId = e.target.value;
          startTransition(async () => {
            const res = await updateTeamRole({ organisationSlug, targetUserId: row.userId, roleId });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            showToast("Role updated", "success");
            router.refresh();
          });
        }}
      >
        {current ? <option value={current.id} disabled>{current.name}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </Dropdown>
      <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setConfirmRemove(true)}>
        Remove
        {memberName ? <span className="sr-only"> {memberName}</span> : null}
      </Button>
      <ConfirmationDialog
        open={confirmRemove}
        title={memberName ? `Remove ${memberName} from the team?` : "Remove from the team?"}
        message="This person will immediately lose access to the organisation dashboard."
        confirmLabel="Remove from team"
        loading={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          startTransition(async () => {
            const res = await removeTeamMember({ organisationSlug, targetUserId: row.userId });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setConfirmRemove(false);
            showToast("Removed from the team", "success");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
