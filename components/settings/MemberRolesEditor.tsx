"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createMemberRole, updateMemberRole } from "@/app/actions/structure";
import { useFocusFirstError } from "@/components/forms/focusFirstError";
import { RoleChip, ROLE_COLORS, roleTone } from "@/components/members/RoleChip";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

type RoleRow = { id: string; name: string; description: string; color: string; unitId: string | null; archivedAt: Date | null; members: number };
type UnitOption = { id: string; name: string; level: number };

function RoleForm({ slug, units, role, onDone }: { slug: string; units: UnitOption[]; role?: RoleRow; onDone: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: role?.name ?? "", description: role?.description ?? "", color: role?.color ?? "teal", unitId: role?.unitId ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, fieldErrors);
  // Saving keeps the role's archived state; only the archive button changes it.
  const submit = (archived = Boolean(role?.archivedAt)) =>
    startTransition(async () => {
      setError(null);
      const payload = { organisationSlug: slug, ...values, unitId: values.unitId || null };
      const result = role ? await updateMemberRole({ ...payload, roleId: role.id, archived }) : await createMemberRole(payload);
      setConfirmArchive(false);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      } else {
        router.refresh();
        onDone();
      }
    });
  return (
    <form ref={formRef} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Role name" required error={fieldErrors.name?.[0]}>
          <Input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} maxLength={60} placeholder="Systems Engineer" autoFocus />
        </Field>
        <Field label="Only in unit" optional helperText="Offer this role only to members of one unit.">
          <Dropdown value={values.unitId} onChange={(event) => setValues({ ...values, unitId: event.target.value })}>
            <option value="">Everywhere</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
          </Dropdown>
        </Field>
      </div>
      <Field label="Description" optional error={fieldErrors.description?.[0]}>
        <Input value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} maxLength={200} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label text-ink">Colour on cards</legend>
        <div className="flex flex-wrap gap-2">
          {ROLE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-pressed={values.color === color}
              aria-label={color}
              onClick={() => setValues({ ...values, color })}
              className={cn("size-9 rounded-full ring-offset-2 ring-offset-surface transition", roleTone(color), values.color === color ? "ring-2 ring-ink" : "ring-1 ring-line")}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={values.name.trim().length < 2}>{role ? "Save role" : "Add role"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        {role ? (
          <Button type="button" variant={role.archivedAt ? "secondary" : "dangerQuiet"} className="ml-auto" disabled={pending} onClick={() => (role.archivedAt ? submit(false) : setConfirmArchive(true))}>
            {role.archivedAt ? "Restore role" : "Archive role"}
          </Button>
        ) : null}
      </div>
      {role ? (
        <ConfirmDialog
          open={confirmArchive}
          title={`Archive ${role.name}?`}
          message={`${role.members === 0 ? "No members hold this role." : `${role.members === 1 ? "1 member holds" : `${role.members} members hold`} this role. They keep it on their record, but their cards stop using its design and wording.`} Nobody new can be given it until you restore it.`}
          confirmLabel="Archive role"
          loading={pending}
          onConfirm={() => submit(true)}
          onCancel={() => setConfirmArchive(false)}
        />
      ) : null}
    </form>
  );
}

/** Roles members hold in the organisation, such as Secretary or Systems Engineer. */
export function MemberRolesEditor({ slug, roles, units, disabled }: { slug: string; roles: RoleRow[]; units: UnitOption[]; disabled: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const unitName = (id: string | null) => units.find((unit) => unit.id === id)?.name;
  return (
    <div className="flex flex-col gap-3">
      {roles.length === 0 && editing !== "new" ? <EmptyState mood="sleepy">No roles yet. Add the roles your members hold.</EmptyState> : null}
      <ul className="flex flex-col divide-y divide-line">
        {roles.map((role) => (
          <li key={role.id} className="py-3">
            {editing === role.id ? (
              <RoleForm slug={slug} units={units} role={role} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <RoleChip name={role.name} color={role.color} />
                <span className="min-w-0 flex-1 text-caption text-ink-muted">
                  {role.members} {role.members === 1 ? "member" : "members"}
                  {role.unitId ? ` · only in ${unitName(role.unitId) ?? "a unit"}` : ""}
                  {role.description ? ` · ${role.description}` : ""}
                </span>
                {role.archivedAt ? <Chip size="sm">Archived</Chip> : null}
                {!disabled ? <Button size="sm" variant="ghost" onClick={() => setEditing(role.id)}>Edit</Button> : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!disabled ? (editing === "new" ? <RoleForm slug={slug} units={units} onDone={() => setEditing(null)} /> : (
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
