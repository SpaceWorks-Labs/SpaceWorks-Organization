import type { ReactNode } from "react";

/** The bordered list the security cards share (sign-in methods, passkeys, phone, devices). */
export function SecurityList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">{children}</ul>;
}

/**
 * One row of a security list: a round icon tile, a title (or `children` in its place, such as a rename form), a muted
 * line, then a status pill and the row's actions, which wrap under the text on a phone.
 */
export function SecurityRow({ icon, title, description, status, actions, children }: { icon: ReactNode; title?: ReactNode; description?: ReactNode; status?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-ink-secondary [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        {children ?? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-label text-ink">{title}</p>
            {description ? <p className="text-caption text-ink-muted">{description}</p> : null}
          </>
        )}
      </div>
      {status}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </li>
  );
}
