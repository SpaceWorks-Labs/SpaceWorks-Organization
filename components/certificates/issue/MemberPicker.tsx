"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { searchCertificateRecipients, type CertificateRecipientOption } from "@/app/actions/certificates";
import { IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/cn";

const SEARCH_DELAY_MS = 250;

/**
 * Choose members one by one: a search of names inside the issuer's reach (20 at a time) and the chosen members as
 * a list with a Remove button each. The result count is announced politely.
 */
export function MemberPicker({ organisationSlug, chosen, limit, onChange }: { organisationSlug: string; chosen: CertificateRecipientOption[]; limit: number; onChange: (next: CertificateRecipientOption[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CertificateRecipientOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const ticket = ++request.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchCertificateRecipients({ organisationSlug, query: text });
        if (ticket !== request.current) return;
        setError(result.ok ? null : result.error);
        setResults(result.ok ? result.data?.members ?? [] : null);
      } catch {
        if (ticket === request.current) setError("The search didn't finish. Check your connection and try again.");
      } finally {
        if (ticket === request.current) setLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, organisationSlug]);

  const chosenIds = new Set(chosen.map((member) => member.id));
  const full = chosen.length >= limit;
  const shown = query.trim().length >= 2 ? results : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="recipient-search" className="text-label text-ink">Find members</label>
        <SearchField id="recipient-search" value={query} loading={loading} loadingLabel="Searching members" placeholder="Type at least 2 letters of a name" autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <p className="sr-only" role="status" aria-live="polite">{shown ? `${shown.length} ${shown.length === 1 ? "member" : "members"} found` : ""}</p>
      {shown ? (
        shown.length ? (
          <ul aria-label="Search results" className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-1">
            {shown.map((member) => {
              const added = chosenIds.has(member.id);
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    disabled={added || full}
                    onClick={() => onChange([...chosen, member])}
                    className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-body-ui text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted motion-reduce:transition-none")}
                  >
                    <Plus aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    <span className="shrink-0 text-caption text-ink-muted">{added ? "Added" : member.unitName ?? ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-caption text-ink-muted">No members you can see have a name like that.</p>
        )
      ) : null}
      {full ? <p className="text-caption text-ink-secondary">One request issues up to {limit} certificates. Issue these, then choose more.</p> : null}
      <div className="flex flex-col gap-1.5">
        <p className="text-label text-ink">Chosen <span className="tabular-nums">({chosen.length})</span></p>
        {chosen.length ? (
          <ul aria-label="Chosen members" className="flex flex-wrap gap-1.5">
            {chosen.map((member) => (
              <li key={member.id} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-subtle pl-3 text-body-ui text-ink">
                <span className="max-w-[16rem] truncate">{member.name}</span>
                <IconButton size="sm" label={`Remove ${member.name}`} onClick={() => onChange(chosen.filter((item) => item.id !== member.id))}><X /></IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-ink-muted">Nobody yet. Search above and choose members to add them.</p>
        )}
      </div>
    </div>
  );
}
