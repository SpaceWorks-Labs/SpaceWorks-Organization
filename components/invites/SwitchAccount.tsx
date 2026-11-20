"use client";

import { signOut } from "next-auth/react";

/** Signed in as the wrong person: sign out and come back to this invite (signOut ends with a full page load). */
export function SwitchAccount({ token, email }: { token: string; email: string }) {
  return (
    <p className="text-caption text-ink-muted">
      Signed in as <span className="font-semibold text-ink">{email}</span> ·{" "}
      <button type="button" className="inline-flex min-h-11 items-center align-middle font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink" onClick={() => void signOut({ callbackUrl: `/join/org/${token}` })}>
        Switch account
      </button>
    </p>
  );
}
