"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

/** Settings sections: the organisation's profile, its structure, its money and calendar, and its public page. */
export function SettingsTabsNav({ slug, ownerTabs }: { slug: string; ownerTabs: boolean }) {
  const pathname = usePathname() ?? "";
  const base = `/dashboard/${slug}/settings`;
  const items = [
    { href: base, label: "Profile" },
    { href: `${base}/structure`, label: "Units and roles" },
    { href: `${base}/groupings`, label: "Groupings" },
    { href: `${base}/roles`, label: "Staff roles" },
    { href: `${base}/money`, label: "Money and year" },
    { href: `${base}/payments`, label: "Payments and tax" },
    { href: `${base}/cards`, label: "Cards" },
    { href: `${base}/email`, label: "Email" },
    { href: `${base}/notifications`, label: "Notifications" },
    { href: `${base}/messaging`, label: "Messaging" },
    { href: `${base}/public-page`, label: "Public page" },
    // Outside analytics is the Owner's choice alone ("org.delete"); a super admin with platform access acts as Owner.
    ...(ownerTabs ? [{ href: `${base}/analytics`, label: "Web analytics" }] : []),
  ];
  return <NavTabs label="Settings sections" items={items.map((item) => ({ ...item, active: item.href === base ? pathname === base : pathname.startsWith(item.href) }))} />;
}
