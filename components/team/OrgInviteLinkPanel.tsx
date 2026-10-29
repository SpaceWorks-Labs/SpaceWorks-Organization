"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2 } from "lucide-react";
import { MoodTile } from "@/components/brand/MoodTile";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { createOrgInvite, revokeOrgInvite } from "@/app/actions/org-invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Dropdown, Field } from "@/components/ui/field";
import { leastPrivilegedRole, type TeamRoleOption, type TeamUnitOption } from "@/components/team/memberSummary";

type OrgInviteRow = {
  id: string;
  token: string;
  /** Pre-formatted on the server ("2 days ago") so it hydrates identically. */
  createdLabel: string;
  /** What the link gives: "Manager" or "Manager · South". */
  grantLabel: string;
};

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Single-use organisation invite links for staff who manage the team (the actions re-check the role and unit).
 * Each link gives one role, for the whole organisation or one unit. Only the newest link's URL is ever rendered.
 */
export function OrgInviteLinkPanel(props: {
  organisationSlug: string;
  baseUrl: string;
  invites: OrgInviteRow[];
  roleOptions: TeamRoleOption[];
  units: TeamUnitOption[];
  canGrantOrgWide: boolean;
}) {
  const { organisationSlug, baseUrl, roleOptions, units, canGrantOrgWide } = props;
  const [unitId, setUnitId] = useState(canGrantOrgWide ? "" : (units[0]?.id ?? ""));
  const reachable = roleOptions.filter((option) => (unitId ? option.scoped : option.orgWide));
  const [chosenRole, setChosenRole] = useState(() => leastPrivilegedRole(reachable));
  const roleId = reachable.some((option) => option.id === chosenRole) ? chosenRole : leastPrivilegedRole(reachable);
  const router = useRouter();
  const [invites, setInvites] = useState<OrgInviteRow[]>(props.invites);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [revokeTarget, setRevokeTarget] = useState<OrgInviteRow | null>(null);

  const latest = invites[0] ?? null;
  const latestUrl = latest ? `${baseUrl}/join/org/${latest.token}` : "";

  function createLink() {
    startTransition(async () => {
      const res = await createOrgInvite({ organisationSlug, roleId, unitId: unitId || null });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const { inviteId, token } = res.data as { inviteId: string; token: string };
      const roleName = roleOptions.find((option) => option.id === roleId)?.name ?? "";
      const unitName = units.find((unit) => unit.id === unitId)?.name;
      setInvites((prev) => [{ id: inviteId, token, createdLabel: "Just now", grantLabel: unitName ? `${roleName} · ${unitName}` : roleName }, ...prev]);
      showToast("Invite link created", "success");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="invite-title" className="flex min-w-0 flex-col gap-3.5 rounded-xl bg-tint-peach p-5">
      <div className="flex items-center gap-3">
        <MoodTile mood="cheering" size={52} className="sw-face shrink-0" />
        <div className="min-w-0">
          <h2 id="invite-title" className="text-h4 text-ink">Invite people</h2>
          <p className="text-body-ui text-ink-secondary">Each link adds one person to the team with the role you choose. You can change it after they join.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Role">
          <Dropdown value={roleId} disabled={pending || !reachable.length} onChange={(event) => setChosenRole(event.target.value)}>
            {reachable.length ? null : <option value="">No role you can give here</option>}
            {reachable.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Dropdown>
        </Field>
        {units.length ? (
          <Field label="Where" helperText="Limit them to one unit and everything under it.">
            <Dropdown value={unitId} disabled={pending} onChange={(event) => setUnitId(event.target.value)}>
              {canGrantOrgWide ? <option value="">Whole organisation</option> : null}
              {units.map((unit) => <option key={unit.id} value={unit.id}>{`${"— ".repeat(unit.level)}${unit.name}`}</option>)}
            </Dropdown>
          </Field>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="org-invite-url" className="text-label text-ink">Newest link</label>
        <input
          id="org-invite-url"
          readOnly
          value={latestUrl}
          placeholder="No open link yet"
          onFocus={(event) => event.currentTarget.select()}
          className="block min-h-11 w-full min-w-0 truncate rounded-md border border-line bg-panel px-3.5 tabular-nums text-[13px] text-ink-secondary placeholder:font-sans placeholder:text-ink-muted"
        />
        <div className="flex flex-wrap gap-2">
          {latestUrl ? (
            <>
              <Button
                variant="primary"
                disabled={pending}
                startIcon={<Copy />}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(latestUrl)
                    .then(() => showToast("Copied link", "success"))
                    .catch(() => showToast("Could not copy link", "error"));
                }}
              >
                Copy link
              </Button>
              <Button variant="secondary" loading={pending} loadingLabel="Creating link" disabled={!roleId} startIcon={<Link2 />} onClick={createLink}>
                New link
              </Button>
            </>
          ) : (
            <Button variant="primary" loading={pending} loadingLabel="Creating link" disabled={!roleId} startIcon={<Link2 />} onClick={createLink}>
              Create link
            </Button>
          )}
        </div>
      </div>

      {invites.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <h3 className="text-overline text-ink-muted">Open links · {invites.length}</h3>
          <ul className="flex flex-col">
            {invites.map((invite, index) => (
              <li key={invite.id} className="flex min-w-0 items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-body-ui text-ink">
                  {invite.grantLabel}
                  <span className="text-ink-muted"> · created {lowerFirst(invite.createdLabel)}</span>
                </span>
                {index === 0 ? <Chip size="sm" tone="outline" className="shrink-0">Newest</Chip> : null}
                <Button size="sm" variant="dangerQuiet" disabled={pending} onClick={() => setRevokeTarget(invite)}>
                  Revoke
                  <span className="sr-only"> link created {lowerFirst(invite.createdLabel)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmationDialog
        open={revokeTarget !== null}
        title="Revoke invite link?"
        message="Anyone who has this link will no longer be able to use it to join the organisation."
        confirmLabel="Revoke link"
        loading={pending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          const target = revokeTarget;
          if (!target) return;
          startTransition(async () => {
            const res = await revokeOrgInvite({ organisationSlug, inviteId: target.id });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setInvites((prev) => prev.filter((x) => x.id !== target.id));
            setRevokeTarget(null);
            showToast("Invite revoked", "success");
            router.refresh();
          });
        }}
      />
    </section>
  );
}
