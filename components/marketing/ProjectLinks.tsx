"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { CHANGELOG_URL, GITHUB_URL, INSTALL_COMMAND, LICENSE_URL, RELEASE_URL, RELEASE_VERSION } from "@/lib/openSource";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { CopyCommand } from "./CopyCommand";

/** The project's own links (product rules §12.1), shared by the site header and footer. All leave the site. */
export const PROJECT_LINKS = [
  { label: "GitHub repository", href: GITHUB_URL },
  { label: `Latest release, ${RELEASE_VERSION}`, href: RELEASE_URL },
  { label: "Changelog", href: CHANGELOG_URL },
  { label: "Licence: AGPL-3.0", href: LICENSE_URL },
] as const;

/** A link that opens on GitHub in a new tab, saying so to screen readers. */
export function ExternalLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** The one-line installer, scrollable inside its own box on narrow screens, with a copy button. */
export function InstallCommand({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <p className="text-label font-semibold text-ink">Install on a Linux server</p>
      <div className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface py-1 pl-3 pr-1">
        <code tabIndex={0} aria-label="Install command" className="code-text min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-2 text-caption text-ink [overflow-wrap:normal]">
          {INSTALL_COMMAND}
        </code>
        <CopyCommand command={INSTALL_COMMAND} label="Copy" className="min-h-10" />
      </div>
    </div>
  );
}

/** The header's "Project" popover: release, changelog, licence and the install command. */
export function ProjectMenu({ triggerClassName }: { triggerClassName: string }) {
  return (
    <Popover>
      <PopoverTrigger className={cn(triggerClassName, "gap-1 data-[state=open]:bg-surface data-[state=open]:text-ink")}>
        Project
        <ChevronDown aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-[min(24rem,calc(100vw-32px))] gap-3 p-4">
        <ul className="grid">
          {PROJECT_LINKS.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-body-ui text-ink transition-colors duration-(--sw-dur-fast) hover:bg-muted">
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
        <InstallCommand className="border-t border-line pt-3" />
      </PopoverContent>
    </Popover>
  );
}
