"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { reorderStaffRoles } from "@/app/actions/staff-roles";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import type { Capability } from "@/lib/permissionRoles";
import { capabilityLabel } from "@/lib/team/capabilities";
import { StaffRoleForm, type StaffRoleRow } from "./StaffRoleForm";

function people(count: number) {
  return count === 1 ? "1 person" : `${count} people`;
}

function summary(role: StaffRoleRow) {
  if (role.isOwner) return "Every permission, including the team, roles, card approval and deleting the organisation.";
  if (!role.capabilities.length) return "No permissions yet.";
  return role.capabilities.map((capability) => capabilityLabel(capability as Capability)).join(", ");
}

/** The organisation's staff roles in order, with editing, archiving and reordering for those who may. */
export function StaffRolesEditor({ slug, roles, allowed, canEdit }: { slug: string; roles: StaffRoleRow[]; allowed: Capability[]; canEdit: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const movable = roles.filter((role) => !role.isOwner);

  const move = (roleId: string, step: -1 | 1) => {
    const order = movable.map((role) => role.id);
    const index = order.indexOf(roleId);
    const swap = index + step;
    if (index < 0 || swap < 0 || swap >= order.length) return;
    [order[index], order[swap]] = [order[swap], order[index]];
    startTransition(async () => {
      const result = await reorderStaffRoles({ organisationSlug: slug, roleIds: order });
      if (!result.ok) showToast(result.error, "error");
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line">
        {roles.map((role) => {
          const position = movable.findIndex((item) => item.id === role.id);
          return (
            <li key={role.id} className="py-3">
              {editing === role.id ? (
                <StaffRoleForm slug={slug} role={role} allowed={allowed} onDone={() => setEditing(null)} />
              ) : (
                <div className={cn("flex flex-wrap items-start gap-3", role.archived && "opacity-60")}>
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{role.name}</span>
                      {role.isOwner ? <Chip size="sm" tone="ink">Owner</Chip> : null}
                      {role.archived ? <Chip size="sm">Archived</Chip> : null}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {people(role.holders)}
                      {role.invites ? ` · ${role.invites === 1 ? "1 open invite" : `${role.invites} open invites`}` : ""}
                      {role.description ? ` · ${role.description}` : ""}
                    </span>
                    <span className="text-caption text-ink-secondary">{summary(role)}</span>
                    {canEdit && role.lockedReason && !role.isOwner ? <span className="text-caption text-ink-muted">{role.lockedReason}</span> : null}
                  </div>
                  {canEdit && !role.isOwner ? (
                    <div className="flex items-center gap-1">
                      <IconButton label={`Move ${role.name} up`} size="sm" disabled={pending || position <= 0} onClick={() => move(role.id, -1)}><ArrowUp /></IconButton>
                      <IconButton label={`Move ${role.name} down`} size="sm" disabled={pending || position >= movable.length - 1} onClick={() => move(role.id, 1)}><ArrowDown /></IconButton>
                      {!role.lockedReason ? <Button size="sm" variant="ghost" onClick={() => setEditing(role.id)}>Edit<span className="sr-only"> {role.name}</span></Button> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit ? (editing === "new" ? <StaffRoleForm slug={slug} allowed={allowed} onDone={() => setEditing(null)} /> : (
        <div>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" />
            Add a role
          </Button>
        </div>
      )) : null}
    </div>
  );
}
