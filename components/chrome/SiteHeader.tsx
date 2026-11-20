"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu as MenuIcon, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/button";
import { SpaceWorksProductLogo, SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { ExternalLink, InstallCommand, PROJECT_LINKS, ProjectMenu } from "@/components/marketing/ProjectLinks";
import { DOCS_PATH, GITHUB_URL } from "@/lib/openSource";
import { ColorModeToggle } from "./ColorModeToggle";

const primaryLinks = [
  { href: "/features", label: "Features" },
  { href: "/organisations", label: "Organisations" },
  { href: DOCS_PATH, label: "Docs" },
];

const navLinkClasses =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3 text-label text-ink-secondary transition-colors duration-(--sw-dur-fast) hover:bg-surface hover:text-ink";
const sheetLinkClasses = "flex min-h-12 items-center gap-2 rounded-md px-3 text-body font-medium text-ink";

/**
 * The Space Works logo plus the product name "Organization", as a home link (site
 * header, auth pages, app shell, super admin). Below `sm` the symbol stands in
 * for the horizontal lockup so the bar keeps room for its controls. `stacked`
 * puts "Organization" under the lockup, for the narrow dashboard sidebar. The landing splash lands on the
 * lockup's symbol (`data-splash-target`, components/marketing/splashFlight.ts).
 */
export function BrandHomeLink({ href = "/", stacked = false, className }: { href?: string; stacked?: boolean; className?: string }) {
  if (stacked) {
    return (
      <Link href={href} aria-label="Space Works Organization home" className={cn("inline-flex shrink-0 flex-col items-start gap-1.5 rounded-md", className)}>
        <SpaceWorksLogo variant="lockup-stacked" height={64} label={null} />
        <span aria-hidden className="text-[15px] font-semibold leading-none text-ink">Organization</span>
      </Link>
    );
  }
  return (
    <Link href={href} aria-label="Space Works Organization home" data-splash-target="" className={cn("inline-flex shrink-0 items-center gap-3 rounded-md", className)}>
      <SpaceWorksLogo variant="app-icon" height={36} label={null} className="sm:hidden" />
      <SpaceWorksProductLogo height={32} label={null} className="hidden sm:inline-flex" />
    </Link>
  );
}

/**
 * The Space Works Organization site header (docs/DESIGN.md, product rules §12.1): features, organisations, docs,
 * GitHub and the project popover (latest release, changelog, licence and the install command), the colour-mode
 * picker and sign-in. Below xl everything moves into a sheet over the kit's scrim.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const signedIn = status === "authenticated";
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <nav aria-label="Main navigation" className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-2 px-4 sm:gap-6 sm:px-6 xl:px-8">
        <BrandHomeLink />
        <ul className="hidden items-center gap-1 xl:flex">
          {primaryLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} aria-current={isActive(link.href) ? "page" : undefined} className={cn(navLinkClasses, isActive(link.href) && "bg-surface font-semibold text-ink")}>
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <ExternalLink href={GITHUB_URL} className={cn(navLinkClasses, "gap-1")}>GitHub</ExternalLink>
          </li>
          <li>
            <ProjectMenu triggerClassName={navLinkClasses} />
          </li>
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <ColorModeToggle />
          <div className="hidden items-center gap-2.5 md:flex">
            {signedIn ? (
              <>
                <Button asChild variant="quiet" size="sm">
                  <Link href="/account" aria-current={isActive("/account") ? "page" : undefined}>Account</Link>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</Button>
                <Button asChild variant="primary" size="md">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="secondary" size="md">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild variant="primary" size="md">
                  <Link href="/start">Apply for your organisation</Link>
                </Button>
              </>
            )}
          </div>
          <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogPrimitive.Trigger asChild>
              <IconButton label="Open navigation menu" className="xl:hidden">
                <MenuIcon />
              </IconButton>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/48 xl:hidden" />
              <DialogPrimitive.Content className="fixed inset-x-0 top-0 z-50 max-h-dvh overflow-y-auto rounded-b-xl border-b border-line bg-canvas p-4 shadow-float focus:outline-none xl:hidden">
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Site navigation links</DialogPrimitive.Description>
                <div className="mb-3 flex items-center justify-between">
                  <BrandHomeLink />
                  <DialogPrimitive.Close asChild>
                    <IconButton label="Close navigation menu">
                      <X />
                    </IconButton>
                  </DialogPrimitive.Close>
                </div>
                <ul className="flex flex-col">
                  {[...primaryLinks, ...(signedIn ? [{ href: "/dashboard", label: "Dashboard" }, { href: "/account", label: "Account" }] : [])].map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={isActive(link.href) ? "page" : undefined}
                        className={cn(sheetLinkClasses, isActive(link.href) && "bg-surface font-semibold")}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {PROJECT_LINKS.map((link) => (
                    <li key={link.href}>
                      <ExternalLink href={link.href} className={sheetLinkClasses}>{link.label}</ExternalLink>
                    </li>
                  ))}
                </ul>
                <InstallCommand className="mt-3 border-t border-line pt-3" />
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                  {signedIn ? (
                    <Button variant="secondary" fullWidth onClick={() => { setMenuOpen(false); void signOut({ callbackUrl: "/" }); }}>
                      Sign out
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="primary" fullWidth>
                        <Link href="/start" onClick={() => setMenuOpen(false)}>Apply for your organisation</Link>
                      </Button>
                      <Button asChild variant="secondary" fullWidth>
                        <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
                      </Button>
                    </>
                  )}
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </nav>
    </header>
  );
}
