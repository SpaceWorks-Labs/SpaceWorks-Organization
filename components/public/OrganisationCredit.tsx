import Link from "next/link";
import { SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { GITHUB_URL } from "@/lib/openSource";

const linkClasses = "underline-offset-4 hover:text-ink hover:underline";

/**
 * The footer of an organisation's public pages: the only place the Space Works mark appears on them, with the
 * product links every tenant page keeps (features, docs and the source, product rules §12.2 item 4), and the
 * platform's privacy notice and terms.
 */
export function OrganisationCredit() {
  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-6 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 self-start hover:text-ink">
          <SpaceWorksLogo variant="app-icon" height={18} label={null} />
          <span>Powered by Space Works</span>
        </Link>
        <nav aria-label="Space Works">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <li><Link href="/features" className={linkClasses}>Features</Link></li>
            <li><Link href="/docs" className={linkClasses}>Docs</Link></li>
            <li><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClasses}>GitHub<span className="sr-only"> (opens in a new tab)</span></a></li>
            <li><Link href="/privacy" className={linkClasses}>Privacy</Link></li>
            <li><Link href="/terms" className={linkClasses}>Terms</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
