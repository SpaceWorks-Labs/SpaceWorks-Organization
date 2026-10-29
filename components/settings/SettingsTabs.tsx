"use client";

import { usePathname } from "next/navigation";
import { NavTabs } from "@/components/ui/tabs";

/** Settings sections: the organisation's profile, its structure, its money and calendar, and its public page. */
export function SettingsTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/dashboard/${slug}/settings`;
  const items = [
    { href: base, label: "Profile" },
    { href: `${base}/structure`, label: "Units and roles" },
    { href: `${base}/roles`, label: "Staff roles" },
    { href: `${base}/money`, label: "Money and year" },
    { href: `${base}/payments`, label: "Payments and tax" },
    { href: `${base}/cards`, label: "Cards" },
    { href: `${base}/email`, label: "Email" },
    { href: `${base}/notifications`, label: "Notifications" },
    { href: `${base}/public-page`, label: "Public page" },
  ];
  return <NavTabs label="Settings sections" items={items.map((item) => ({ ...item, active: item.href === base ? pathname === base : pathname.startsWith(item.href) }))} />;
}
