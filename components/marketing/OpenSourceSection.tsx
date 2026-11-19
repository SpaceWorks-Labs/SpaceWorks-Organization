import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, FolderGit2, History, Scale, Tag, type LucideIcon } from "lucide-react";
import { CHANGELOG_URL, DOCS_PATH, GITHUB_URL, LICENSE_SPDX, LICENSE_URL, RELEASE_URL, RELEASE_VERSION } from "@/lib/openSource";

/** The AGPL in plain words (the LICENSE file is the governing text). */
const TERMS = [
  { who: "Running it as released", what: "Nothing extra. Use it for your organisation, or as a service for others, commercial or not." },
  { who: "Changing it for yourself", what: "Read every line and change anything. If only you use your changed version, there is nothing to publish." },
  { who: "Running a changed version for others", what: "Offer the people who use it over the network the source of your changes, under the same licence." },
];

const LINKS: ReadonlyArray<{ icon: LucideIcon; label: string; detail?: string; href: string; external: boolean }> = [
  { icon: FolderGit2, label: "Source on GitHub", detail: "SpaceWorks-Labs/SpaceWorks-Organization", href: GITHUB_URL, external: true },
  { icon: Tag, label: `Latest release, ${RELEASE_VERSION}`, detail: "Images, checksums and release notes", href: RELEASE_URL, external: true },
  { icon: History, label: "Changelog", detail: "What changed in every release", href: CHANGELOG_URL, external: true },
  { icon: Scale, label: "Licence", detail: LICENSE_SPDX, href: LICENSE_URL, external: true },
  { icon: BookOpen, label: "Documentation", detail: "Every area, installing and running it", href: DOCS_PATH, external: false },
];

const rowClasses = "flex min-h-16 items-center gap-4 rounded-lg px-2 py-3 font-semibold text-ink transition-colors duration-(--sw-dur-fast) hover:bg-muted";

/** What the licence lets you do, and where the project lives. */
export function OpenSourceSection() {
  return (
    <section id="open-source" aria-labelledby="open-source-title" className="sw-land-section">
      <div className="sw-land-wrap">
        <div className="sw-land-split" data-reveal="">
          <h2 id="open-source-title" className="sw-land-h2">Open source, in plain words.</h2>
          <p className="sw-land-lede">
            Space Works Organization is free software under the GNU Affero General Public License, version 3 or later. No
            licence fee, no permission to ask, and no contributor licence agreement.
          </p>
        </div>
        <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12" data-reveal="">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
              <p className="text-title text-ink">What the licence asks of you</p>
              <span className="code-text rounded-full bg-info-mark px-3 py-0.5 text-caption font-semibold text-on-info-mark">{LICENSE_SPDX}</span>
            </div>
            <dl>
              {TERMS.map((term) => (
                <div key={term.who} className="grid gap-1.5 border-b border-line px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-6 md:px-6">
                  <dt className="font-semibold text-ink">{term.who}</dt>
                  <dd className="text-body-ui text-ink-muted">{term.what}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line bg-surface px-5 py-3 text-caption text-ink-muted md:px-6">A summary, not legal advice: the LICENSE file is the governing text.</p>
          </div>
          <nav aria-labelledby="project-links-title" className="grid content-start gap-3">
            <h3 id="project-links-title" className="text-title text-ink">The project</h3>
            <ul className="grid border-t border-line">
              {LINKS.map(({ icon: Icon, label, detail, href, external }) => {
                const inner = (
                  <>
                    <Icon aria-hidden className="size-5 shrink-0 text-accent-text" />
                    <span className="grid min-w-0 flex-1">
                      <span>{label}</span>
                      {detail ? <span className="code-text truncate text-label font-normal text-ink-muted">{detail}</span> : null}
                    </span>
                    {external ? <ArrowUpRight aria-hidden className="size-4 shrink-0" /> : <ArrowRight aria-hidden className="size-4 shrink-0" />}
                  </>
                );
                return (
                  <li key={label} className="border-b border-line">
                    {external ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className={rowClasses}>
                        {inner}
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ) : (
                      <Link href={href} className={rowClasses}>{inner}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </section>
  );
}
