import Link from "next/link";
import type { OrgReportsMembers } from "@/lib/views/app__dashboard__orgSlug__reports__members__page";
import { formatValue } from "@/lib/reports/chartScale";
import { TermStatusChip } from "@/components/members/TermStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { BarList } from "./charts/BarList";
import { ChartFrame } from "./charts/ChartFrame";
import { Meter } from "./charts/Figures";
import { ExportLink } from "./ReportShell";

type View = OrgReportsMembers;

export function MemberBreakdowns({ view }: { view: View }) {
  const q = view.quality;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {view.units.length ? (
        <ChartFrame className="md:col-span-2 xl:col-span-3" title={`${view.unitLevel} league table`} description="Each row counts its whole subtree. Share is of active members in this view." table={{ columns: ["Unit", "Active", "In grace", "Joined", "Lapsed", "Renewal rate", "Share"], rows: view.units.map((row) => [row.name, row.active, row.grace, row.joined, row.lapsed, formatValue(row.renewalRate, "percent"), formatValue(row.share, "percent")]) }}>
          <BarList label="Active members by unit" items={view.units.map((row) => ({ key: row.unitId ?? "none", label: row.name, value: row.active, href: row.href, display: `${row.active.toLocaleString("en-IN")} · ${formatValue(row.share, "percent")}`, hint: `${row.joined} joined · ${row.lapsed} lapsed · renewal rate ${formatValue(row.renewalRate, "percent")}` }))} />
        </ChartFrame>
      ) : null}
      <ChartFrame title="Active by plan" description="A member on two plans counts on both." table={{ columns: ["Plan", "Active"], rows: view.planMix.map((row) => [row.label, row.value]) }}>
        <BarList label="Active members by plan" items={view.planMix} />
      </ChartFrame>
      <ChartFrame title="How they joined" description="New members in the period, by route." table={{ columns: ["Route", "Joined"], rows: view.sources.map((row) => [row.label, row.value]) }}>
        <BarList label="New members by join route" items={view.sources} empty="Nobody joined in this period." />
      </ChartFrame>
      <ChartFrame title="Member roles" description="Active members holding each role." table={{ columns: ["Role", "Active"], rows: view.roles.map((row) => [row.label, row.value]) }}>
        <BarList label="Active members by role" items={view.roles} />
      </ChartFrame>
      <ChartFrame title="Where they are" description="Active members by state or territory." table={{ columns: ["State", "Active"], rows: view.states.map((row) => [row.label, row.value]) }}>
        <BarList label="Active members by state" items={view.states} />
      </ChartFrame>
      <ChartFrame title="Tenure" description={view.tenure.meanYears !== null ? `Time since they first joined. Average ${view.tenure.meanYears.toFixed(1)} years.` : "Time since they first joined."} table={{ columns: ["Band", "Active"], rows: view.tenure.bands.map((row) => [row.label, row.value]) }}>
        <BarList label="Active members by tenure" ordinal items={view.tenure.bands} />
      </ChartFrame>
      <section aria-labelledby="quality-title" className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h2 id="quality-title" className="text-title text-ink">Record gaps</h2>
        <p className="-mt-2 text-label text-ink-muted">Of {q.members.toLocaleString("en-IN")} member records. Follow a line to fix them.</p>
        {[
          { label: "No phone number", value: q.missingPhone, href: view.qualityLinks.phone },
          { label: "No state (needed for GST place of supply)", value: q.missingState, href: view.qualityLinks.state },
          ...(q.missingUnit !== null ? [{ label: "No unit", value: q.missingUnit, href: view.qualityLinks.unit }] : []),
          { label: "No photo (needed on cards)", value: q.missingPhoto, href: view.qualityLinks.photo },
          { label: "Minors without guardian details", value: q.minorsWithoutGuardian, href: view.qualityLinks.guardian },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="rounded-md py-0.5 hover:bg-subtle">
            <Meter label={item.label} value={item.value} max={q.members} display={`${item.value.toLocaleString("en-IN")}`} warnAt={0.1} criticalAt={0.3} />
          </Link>
        ))}
      </section>
    </div>
  );
}

const STANDING_TABS = [
  { key: "all", label: "Everyone" },
  { key: "active", label: "Active" },
  { key: "grace", label: "In grace" },
  { key: "former", label: "Former members" },
  { key: "never", label: "Never started" },
];

/** B2 register: one page at a time; the CSV export streams every row with the same filters. */
export function MemberRegister({ view }: { view: View }) {
  const { register, shell } = view;
  const base = `/dashboard/${shell.org.slug}/reports/members`;
  const link = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams(shell.query.replace(/^\?/, ""));
    for (const [key, value] of Object.entries({ standing: register.standing === "all" ? "" : register.standing, q: register.q, ...patch })) {
      if (value) params.set(key, String(value));
      else params.delete(key);
    }
    const text = params.toString();
    return text ? `${base}?${text}` : base;
  };
  return (
    <section aria-labelledby="register-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="register-title" className="text-h4 text-ink">Member register</h2>
          <p className="text-label text-ink-muted">
            {register.total.toLocaleString("en-IN")} {register.total === 1 ? "record" : "records"}, standing read at the end of the period.
            {view.masked ? " Contact details are hidden for your role." : ""}
          </p>
        </div>
        {shell.canExport ? <ExportLink shell={shell} report="register" extra={register.standing !== "all" ? `standing=${register.standing}` : ""} /> : null}
      </div>
      <nav aria-label="Filter the register" className="flex flex-wrap gap-2">
        {STANDING_TABS.map((tab) => (
          <Link key={tab.key} href={link({ standing: tab.key === "all" ? "" : tab.key, page: "" })} aria-current={register.standing === tab.key ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm transition-colors", register.standing === tab.key ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}>
            {tab.label}
          </Link>
        ))}
        <form action={base} className="ml-auto flex min-w-0 gap-2">
          {[...new URLSearchParams(link({ q: "", page: "" }).split("?")[1] ?? "")].map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <input name="q" defaultValue={register.q} placeholder="Name or number" aria-label="Search the register" className="min-h-11 w-44 rounded-control border border-line bg-panel px-3.5 text-sm text-ink placeholder:text-ink-muted" />
          <button type="submit" className={buttonClasses({ variant: "secondary", size: "sm" })}>Search</button>
        </form>
      </nav>
      <Table label="Member register">
        <THead>
          <tr>
            <TH>No.</TH>
            <TH>Member</TH>
            <TH>Membership</TH>
            <TH className="hidden md:table-cell">Unit</TH>
            <TH className="hidden lg:table-cell">Member since</TH>
            <TH className="hidden lg:table-cell">Joined by</TH>
          </tr>
        </THead>
        <TBody>
          {register.rows.map((row) => (
            <TR key={row.id}>
              <TD className="tabular-nums text-ink-secondary">{row.memberNumber}</TD>
              <TD>
                <Link href={`/dashboard/${shell.org.slug}/members/${row.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
                <span className="block text-caption text-ink-muted">{[row.email, row.phone].filter(Boolean).join(" · ")}</span>
                {row.roles.length ? <span className="block text-caption text-ink-secondary">{row.roles.join(", ")}</span> : null}
              </TD>
              <TD>
                <span className="flex flex-col gap-1">
                  {row.plans.length ? row.plans.map((plan) => (
                    <span key={plan.planId} className="flex flex-wrap items-center gap-1.5 text-caption">
                      <TermStatusChip status={plan.status} />
                      <span className="text-ink-secondary">{plan.plan}{plan.until ? ` · until ${plan.until}` : ""}</span>
                    </span>
                  )) : <span className="text-caption text-ink-muted">No membership</span>}
                </span>
              </TD>
              <TD className="hidden text-ink-secondary md:table-cell">{row.unit ?? "—"}</TD>
              <TD className="hidden whitespace-nowrap text-ink-secondary lg:table-cell">{row.memberSince ?? "—"}</TD>
              <TD className="hidden text-ink-secondary lg:table-cell">{row.source}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {register.pages > 1 ? (
        <nav aria-label="Register pages" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">Page {register.page} of {register.pages}</span>
          <span className="flex gap-2">
            {register.page > 1 ? <Link href={link({ page: register.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Previous</Link> : null}
            {register.page < register.pages ? <Link href={link({ page: register.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </section>
  );
}
