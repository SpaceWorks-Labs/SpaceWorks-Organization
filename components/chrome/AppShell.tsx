"use client";

import { useRef, useState, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ArrowUpRight, ChevronsUpDown, Home, LogOut, Menu as MenuIcon, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShellOrganisation, ShellUser } from "@/lib/appShell";
import { organisationAllows, type Capability } from "@/lib/permissionRoles";
import { SpaceWorksProductLogo } from "@/components/brand/SpaceWorksLogo";
import { Avatar } from "@/components/ui/display";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { BrandHomeLink } from "./SiteHeader";
import { PlatformOrganisationProvider, usePlatformOrganisation } from "./PlatformOrganisation";
import { ColorModeMenuItem } from "./ColorModeToggle";
import { SlidingNav } from "@/components/motion/SlidingNav";

/** Organisation navigation, in order. Each entry shows only when the role has the capability. */
const ORG_NAV: Array<{ path: string; label: string; capability: Capability; exact?: boolean }> = [
  { path: "", label: "Overview", capability: "org.view", exact: true },
  { path: "/members", label: "Members", capability: "members.view" },
  { path: "/plans", label: "Membership plans", capability: "members.view" },
  { path: "/payments", label: "Payments", capability: "payments.view" },
  { path: "/accounts", label: "Accounts", capability: "payments.view" },
  { path: "/reports", label: "Reports", capability: "reports.membership" },
  { path: "/activity", label: "Activity", capability: "audit.view" },
  { path: "/team", label: "Team", capability: "org.view" },
];

/** Settings opens on the first section the person's role reaches; custom roles may hold only some of them. */
const SETTINGS_ENTRY: Array<{ path: string; capability: Capability }> = [
  { path: "/settings", capability: "org.settings" },
  { path: "/settings/structure", capability: "structure.manage" },
  { path: "/settings/roles", capability: "roles.manage" },
  { path: "/settings/cards", capability: "cards.design" },
  { path: "/settings/payments", capability: "payments.settings" },
];

/** Shows at once that a slow page is on its way: the highlight only moves when the new page commits. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-60" /> : null;
}

function NavItem({ href, children, active, onNavigate, badge }: { href: string; children: string; active: boolean; onNavigate?: () => void; badge?: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        // CR-SIDEBAR-01: text-only, 44px items, 10px control radius, filled teal current item (its fill is the
        // SlidingNav indicator once placed, so it slides between items).
        "sw-slide-item relative flex min-h-11 items-center gap-2.5 rounded-control px-3 text-[15px] text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-sidebar-hover",
        active && "bg-sidebar-active font-semibold text-on-sidebar-active hover:bg-sidebar-active",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
      <PendingDot />
    </Link>
  );
}

function currentOrganisationSlug(pathname: string | null) {
  const match = /^\/dashboard\/([^/]+)/.exec(pathname ?? "");
  if (!match || match[1] === "org" || match[1] === "security") return null;
  return decodeURIComponent(match[1]!);
}

/** The person's menu: account, the Dark theme switch and sign out. */
function AccountMenu({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = user.name ?? user.email ?? "Account";
  return (
    <Menu>
      <MenuTrigger
        ref={triggerRef}
        className={cn(
          "flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-line bg-panel p-2 text-left transition-colors hover:bg-surface data-[state=open]:bg-surface",
          pathname.startsWith("/account") && "ring-1 ring-line-strong",
        )}
      >
        <Avatar name={user.name ?? user.email} src={user.image} size="sm" className="size-8 text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          {user.email && user.name ? <span className="block truncate text-caption text-ink-muted">{user.email}</span> : null}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="min-w-[232px]">
        <MenuLabel>{name}</MenuLabel>
        <MenuItem asChild icon={<UserRound />}>
          <Link href="/account" onClick={onNavigate}>Account settings</Link>
        </MenuItem>
        <MenuSeparator />
        <ColorModeMenuItem originRef={triggerRef} />
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={() => void signOut({ callbackUrl: "/" })}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function OrganisationSwitcher({ current, organisations, onNavigate }: { current: ShellOrganisation; organisations: ShellOrganisation[]; onNavigate?: () => void }) {
  return (
    <Menu>
      <MenuTrigger className="group w-full overflow-hidden rounded-xl border border-line bg-panel text-left transition-colors hover:border-line-strong">
        <span className="flex min-h-[58px] items-center gap-2.5 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{current.name}</span>
            <span className="block text-caption text-ink-muted">{current.roleName}</span>
          </span>
          <ChevronsUpDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">Switch organisation</span>
        </span>
      </MenuTrigger>
      <MenuContent align="start" side="bottom" className="min-w-[240px]">
        <MenuLabel>Organisations</MenuLabel>
        {organisations.map((organisation) => (
          <MenuItem key={organisation.slug} asChild>
            <Link href={`/dashboard/${organisation.slug}`} onClick={onNavigate}>
              <span className="min-w-0 truncate">{organisation.name}</span>
            </Link>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild icon={<Home />}>
          <Link href="/dashboard" onClick={onNavigate}>All organisations</Link>
        </MenuItem>
        <MenuItem asChild icon={<Plus />}>
          <Link href="/start" onClick={onNavigate}>Apply for a new organisation</Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SidebarContents({ user, organisations: teams, onNavigate }: { user: ShellUser; organisations: ShellOrganisation[]; onNavigate?: () => void }) {
  // A super admin inside an organisation they aren't on the team of (platform access) sees it here too.
  const platform = usePlatformOrganisation();
  const organisations = platform && !teams.some((organisation) => organisation.slug === platform.slug) ? [...teams, platform] : teams;
  const pathname = usePathname() ?? "";
  const slug = currentOrganisationSlug(pathname);
  const current = slug ? organisations.find((organisation) => organisation.slug === slug) ?? null : null;
  const base = current ? `/dashboard/${current.slug}` : "";
  const active = current?.status === "ACTIVE";

  return (
    // CR-SIDEBAR-01: 20px inset; nav items sit 4px apart.
    <div className="flex h-full flex-col gap-4 p-5">
      <div>
        <BrandHomeLink href="/dashboard" stacked />
      </div>

      {current ? (
        <>
          <OrganisationSwitcher current={current} organisations={organisations} onNavigate={onNavigate} />
          <SlidingNav aria-label="Organisation" className="flex flex-col gap-1">
            {ORG_NAV.filter((item) => organisationAllows(current.status, item.capability) && current.capabilities.includes(item.capability)).map((item) => {
              const href = `${base}${item.path}`;
              const isActive = item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <NavItem key={item.path} href={href} active={isActive} onNavigate={onNavigate}>
                  {item.label}
                </NavItem>
              );
            })}
            {(() => {
              const entry = SETTINGS_ENTRY.find((item) => organisationAllows(current.status, item.capability) && current.capabilities.includes(item.capability));
              return entry ? (
                <NavItem href={`${base}${entry.path}`} active={pathname.startsWith(`${base}/settings`)} onNavigate={onNavigate}>
                  Settings
                </NavItem>
              ) : null;
            })()}
            {active ? null : (
              // Under review, declined, suspended or archived: the status page explains what is open.
              <NavItem href={`${base}/application`} active={pathname.startsWith(`${base}/application`)} onNavigate={onNavigate}>
                {current.status === "SUSPENDED" || current.status === "ARCHIVED" ? "Status" : "Application"}
              </NavItem>
            )}
          </SlidingNav>
        </>
      ) : (
        <SlidingNav aria-label="Workspace" className="flex flex-col gap-1">
          <NavItem href="/dashboard" active={pathname === "/dashboard"} onNavigate={onNavigate}>Home</NavItem>
          <p className="mt-4 px-3 pb-0.5 text-overline text-ink-muted">Organisations</p>
          {organisations.map((organisation) => (
            <Link
              key={organisation.slug}
              href={`/dashboard/${organisation.slug}`}
              onClick={onNavigate}
              className="relative flex min-h-11 items-center gap-2.5 rounded-control px-3 text-[15px] text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-sidebar-hover"
            >
              <span className="min-w-0 flex-1 truncate">{organisation.name}</span>
            </Link>
          ))}
          <NavItem href="/start" active={pathname === "/start"} onNavigate={onNavigate}>Apply for an organisation</NavItem>
        </SlidingNav>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {current && active ? (
          <Link
            href={`/o/${current.slug}`}
            onClick={onNavigate}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            View public page
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        ) : null}
        <AccountMenu user={user} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/**
 * Dashboard app shell (docs/DESIGN.md, CR-SIDEBAR-01): a 256px sidebar (Citron in light, #0B0B0B in dark) with
 * text-only navigation from 1024px, and a top bar with a menu sheet below it. There is no icon rail and no logo
 * in a nav row: the navigation is words only.
 */
export function AppShell({ user, organisations, children }: { user: ShellUser; organisations: ShellOrganisation[]; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <PlatformOrganisationProvider>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <aside className="sticky top-0 hidden h-dvh w-[256px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-line bg-sidebar lg:block">
          <SidebarContents user={user} organisations={organisations} />
        </aside>

        <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
          <Link href="/dashboard" aria-label="Space Works Organization home" className="inline-flex shrink-0 items-center rounded-md">
            <SpaceWorksProductLogo height={30} label={null} />
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <IconButton label="Open navigation menu">
                <MenuIcon />
              </IconButton>
            </SheetTrigger>
            <SheetContent edge="left" title="Navigation" description="Dashboard navigation" closeLabel="Close navigation menu" className="w-[min(280px,86vw)] bg-sidebar">
              <SidebarContents user={user} organisations={organisations} onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-9 lg:py-9">
          <div className="mx-auto w-full max-w-[1120px]">{children}</div>
        </main>
      </div>
    </PlatformOrganisationProvider>
  );
}
