import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";

/* ---------- Stats ---------- */

export function MemberStat({ label, value, hint, dots }: { label: string; value: ReactNode; hint: ReactNode; dots?: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-panel px-5 py-4">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex min-w-0 items-end justify-between gap-3">
        <span className="font-display text-[34px] font-semibold leading-none text-ink">{value}</span>
        {dots && dots.length > 0 ? (
          <span aria-hidden className="flex min-w-0 flex-wrap justify-end gap-1 pb-1">
            {dots.map((tone, index) => (
              <span key={index} className={cn("size-[9px] rounded-full", tone)} />
            ))}
          </span>
        ) : null}
      </span>
      <span className="truncate text-caption text-ink-muted">{hint}</span>
    </div>
  );
}

/* ---------- Roles ---------- */

type RoleSummary = { id: string; name: string; description: string; isOwner: boolean; holders: number };

/** The organisation's staff roles and what each is for, with a way to change them for those who may. */
export function RolesCard({ roles, manageHref }: { roles: RoleSummary[]; manageHref?: string }) {
  return (
    <section aria-labelledby="roles-title" className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <h2 id="roles-title" className="text-h4 text-ink">What each role can do</h2>
      <dl className="flex flex-col gap-3">
        {roles.map((role) => (
          <div key={role.id} className="flex gap-3">
            <dt className="shrink-0">
              <Chip size="sm" tone={role.isOwner ? "ink" : "neutral"} className="min-w-[64px] justify-center">{role.name}</Chip>
            </dt>
            <dd className="min-w-0 text-body-ui text-ink-secondary">
              {role.description || "No description yet."}
              <span className="block text-caption text-ink-muted">{role.holders === 1 ? "1 person" : `${role.holders} people`}</span>
            </dd>
          </div>
        ))}
      </dl>
      {manageHref ? (
        <div>
          <Button asChild size="sm" variant="secondary"><Link href={manageHref}>Manage roles</Link></Button>
        </div>
      ) : null}
    </section>
  );
}
