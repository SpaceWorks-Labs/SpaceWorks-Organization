"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

/** Report sections. Money and Tax need finance access; Team activity needs audit access; Units needs a structure. Tabs keep the filters. */
export function ReportTabs({ slug, query, finance, activity, units = false }: { slug: string; query: string; finance: boolean; activity: boolean; units?: boolean }) {
  const pathname = usePathname() ?? "";
  const base = `/dashboard/${slug}/reports`;
  const items = [
    { href: base, label: "Overview" },
    { href: `${base}/members`, label: "Members" },
    ...(units ? [{ href: `${base}/units`, label: "Units" }] : []),
    { href: `${base}/renewals`, label: "Renewals" },
    { href: `${base}/applications`, label: "Applications" },
    ...(finance ? [{ href: `${base}/money`, label: "Money" }, { href: `${base}/cash`, label: "Cash in hand" }, { href: `${base}/tax`, label: "Tax and receipts" }] : []),
    ...(activity ? [{ href: `${base}/activity`, label: "Team activity" }] : []),
  ];
  return (
    <div className="sw-print-hide">
      <NavTabs label="Report sections" items={items.map((item) => ({ href: `${item.href}${query}`, label: item.label, active: item.href === base ? pathname === base : pathname.startsWith(item.href) }))} />
    </div>
  );
}
