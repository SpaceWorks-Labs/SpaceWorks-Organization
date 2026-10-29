"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ArrowLeft, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandHomeLink } from "@/components/chrome/SiteHeader";
import { useAppColorMode } from "@/components/providers";
import { Avatar } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";

const sections = [
  { label: "Overview", href: "/super-admin" },
  { label: "Organisations", href: "/super-admin/orgs" },
  { label: "Reports", href: "/super-admin/reports" },
  { label: "Analytics", href: "/super-admin/analytics" },
  { label: "Users", href: "/super-admin/users" },
  { label: "Email", href: "/super-admin/email" },
  { label: "Audit log", href: "/super-admin/audit" },
  { label: "Monitoring", href: "/super-admin/monitoring" },
  { label: "Operations", href: "/super-admin/operations" },
  { label: "Auth", href: "/super-admin/auth" },
  { label: "Security", href: "/super-admin/security" },
  { label: "Storage", href: "/super-admin/storage" },
  { label: "Settings", href: "/super-admin/settings" },
] as const;

function activeSection(pathname: string): string | null {
  if (pathname === "/super-admin") return "/super-admin";
  return (
    sections
      .map((section) => section.href)
      .filter((href) => href !== "/super-admin")
      .find((href) => pathname === href || pathname.startsWith(`${href}/`)) ?? null
  );
}

type SuperAdminUser = { name: string | null; email: string | null; image: string | null };

/** The person's menu: account settings, light/dark mode and sign out (same items as the app shell). */
function AccountMenu({ user }: { user: SuperAdminUser }) {
  const { mode, toggleColorMode } = useAppColorMode();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = user.name ?? user.email ?? "Account";
  return (
    <Menu>
      <MenuTrigger
        ref={triggerRef}
        aria-label={`Account menu for ${name}`}
        className="inline-flex shrink-0 rounded-full outline-offset-2 transition-opacity hover:opacity-85"
      >
        <Avatar name={user.name ?? user.email} src={user.image} size="sm" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[232px]">
        <MenuLabel>{name}</MenuLabel>
        <MenuItem asChild icon={<UserRound />}>
          <Link href="/account">Account settings</Link>
        </MenuItem>
        <MenuItem
          icon={mode === "dark" ? <Sun /> : <Moon />}
          onSelect={() => {
            const rect = triggerRef.current?.getBoundingClientRect();
            toggleColorMode(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
          }}
        >
          {mode === "dark" ? "Light mode" : "Dark mode"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={() => void signOut({ callbackUrl: "/" })}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Light top bar for the instance-wide super-admin area (docs/DESIGN.md §4.13):
 * Space Works Organization logo and "Super admin" label, a way back to the dashboard and the
 * account menu, then a row of section links that scrolls sideways on phones.
 */
export function SuperAdminTopBar({ user }: { user: SuperAdminUser }) {
  const pathname = usePathname() ?? "";
  const active = activeSection(pathname);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        <BrandHomeLink href="/super-admin" />
        <span aria-hidden className="h-5 w-px bg-line" />
        <span className="truncate text-label text-ink">Super admin</span>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            <span className="hidden sm:inline">Back to dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Link>
          <AccountMenu user={user} />
        </div>
      </div>
      <nav aria-label="Super admin sections" className="mx-auto w-full max-w-[1200px] overflow-x-auto px-4 pb-2.5 sm:px-6">
        <ul className="flex w-max items-center gap-1">
          {sections.map((section) => {
            const isActive = section.href === active;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center whitespace-nowrap rounded-control px-3 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface hover:text-ink",
                    isActive && "bg-sidebar-active font-semibold text-on-sidebar-active hover:bg-sidebar-active hover:text-on-sidebar-active",
                  )}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
