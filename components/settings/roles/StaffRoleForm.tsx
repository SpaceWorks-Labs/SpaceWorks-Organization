"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveStaffRole, createStaffRole, updateStaffRole } from "@/app/actions/staff-roles";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { CAPABILITY_GROUPS, isOrgWide, ROLE_TEMPLATES } from "@/lib/team/capabilities";
import type { Capability } from "@/lib/permissionRoles";

/** A staff role as the Settings → Roles page shows it. */
export type StaffRoleRow = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  isOwner: boolean;
  archived: boolean;
  holders: number;
  invites: number;
  /** Why the viewer can't edit this role, or null when they can. */
  lockedReason: string | null;
};

/** Create or edit a staff role: name, description and permissions in readable sections, with one-click templates. */
export function StaffRoleForm({ slug, role, allowed, onDone }: { slug: string; role?: StaffRoleRow; allowed: Capability[]; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set(role?.capabilities ?? ["org.view"]));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const permitted = new Set<string>(allowed);

  const toggle = (capability: Capability, on: boolean) => setChosen((current) => {
    const next = new Set(current);
    if (on) next.add(capability);
    else next.delete(capability);
    return next;
  });

  const finish = (result: { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }) => {
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.refresh();
    onDone();
  };

  const save = () => startTransition(async () => {
    setError(null);
    const payload = { organisationSlug: slug, name, description, capabilities: [...chosen] };
    finish(role ? await updateStaffRole({ ...payload, roleId: role.id }) : await createStaffRole(payload));
  });

  const archive = () => startTransition(async () => {
    if (!role) return;
    setError(null);
    finish(await archiveStaffRole({ organisationSlug: slug, roleId: role.id, archived: !role.archived }));
  });

  return (
    <form className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {role && role.holders > 0 ? (
        <Callout tone="info">{role.holders === 1 ? "1 person holds" : `${role.holders} people hold`} this role. They get any change straight away.</Callout>
      ) : null}
      {!role ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-ink">Start from</span>
          {ROLE_TEMPLATES.map((template) => (
            <Button
              key={template.name}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setName(template.name);
                setDescription(template.description);
                setChosen(new Set(template.capabilities.filter((capability) => permitted.has(capability))));
              }}
            >
              {template.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Role name" required error={fieldErrors.name?.[0]}>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Area head" autoFocus />
        </Field>
        <Field label="Description" optional error={fieldErrors.description?.[0]}>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} placeholder="What this person looks after" />
        </Field>
      </div>
      <p className="text-caption text-ink-muted">
        Permissions marked <Chip size="sm" tone="outline">Whole organisation</Chip> work only for people who hold the role for the whole organisation. Someone given it for one unit can read those screens but not change them.
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {CAPABILITY_GROUPS.map((group) => (
          <fieldset key={group.title} className="flex flex-col gap-2.5">
            <legend className="mb-1 text-label text-ink">{group.title}</legend>
            {group.items.map((item) => (
              <CheckboxField
                key={item.capability}
                checked={chosen.has(item.capability)}
                disabled={pending || !permitted.has(item.capability)}
                onCheckedChange={(value) => toggle(item.capability, value === true)}
                label={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {item.label}
                    {isOrgWide(item.capability) ? <Chip size="sm" tone="outline">Whole organisation</Chip> : null}
                  </span>
                }
              />
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={name.trim().length < 2}>{role ? "Save role" : "Add role"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        {role ? (
          <Button type="button" variant="dangerQuiet" className="ml-auto" disabled={pending} onClick={archive}>
            {role.archived ? "Restore role" : "Archive role"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
