"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { loadCardPreviewHolder, searchCardPreviewMembers, type PreviewMemberOption } from "@/app/actions/card-preview";
import { Button, IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { SearchField } from "@/components/ui/search-field";
import type { CardHolder } from "@/lib/cards/types";
import { keepKeysInside } from "./shared";

const SEARCH_DELAY_MS = 250;

type Target = { organisationSlug: string; planId: string | null; roleId: string | null; unitId: string | null };
export type PreviewMember = { id: string; name: string };

/**
 * Preview the card with a real member instead of the sample. Search finds up to 20 members inside the viewer's
 * unit and grouping scope; the preview shows their name, role, card number, units, plan, validity and photo, with
 * sample answers and a dummy QR.
 */
export function PreviewMemberPicker({ target, chosen, onChosen, onPreviewHolder }: { target: Target; chosen: PreviewMember | null; onChosen: (member: PreviewMember | null) => void; onPreviewHolder: (holder: CardHolder | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PreviewMemberOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { organisationSlug, planId, roleId, unitId } = target;
  // Results belong to the current query; an empty field shows none.
  const shown = open && query.trim() ? results : null;

  useEffect(() => {
    const text = query.trim();
    if (!open || !text) return;
    let live = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchCardPreviewMembers({ organisationSlug, query: text }).then((result) => {
        if (!live) return;
        setSearching(false);
        if (result.ok) {
          setResults(result.data?.members ?? []);
          setError(null);
        } else setError(result.error);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, query, organisationSlug]);

  const pick = async (member: PreviewMemberOption) => {
    setError(null);
    const result = await loadCardPreviewHolder({ organisationSlug, planId, roleId, unitId, memberId: member.id });
    if (!result.ok || !result.data) {
      setError(result.ok ? "That member can't be previewed." : result.error);
      return;
    }
    onPreviewHolder(result.data.holder);
    onChosen({ id: member.id, name: member.name });
    setOpen(false);
  };

  const useSample = () => {
    onPreviewHolder(null);
    onChosen(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label={chosen ? `Previewing with ${chosen.name}` : "Preview with a member"} size="sm" variant={chosen ? "secondary" : "quiet"} aria-pressed={Boolean(chosen)}>
          <UserRound />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(340px,calc(100vw-32px))] flex-col gap-3" onKeyDown={keepKeysInside}>
        <div>
          <p className="text-label text-ink">Preview with a member</p>
          <p className="text-caption text-ink-muted">{chosen ? `Showing ${chosen.name}. ` : ""}Answers stay as samples and the QR code is a dummy.</p>
        </div>
        <SearchField aria-label="Search members by name" placeholder="Search by name" value={query} onChange={(event) => setQuery(event.target.value)} loading={searching} clearOnEscape={false} autoFocus />
        {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
        {shown && shown.length === 0 && !searching ? <p className="text-caption text-ink-muted">No members you can see match that name.</p> : null}
        {shown && shown.length > 0 ? (
          <ul aria-label="Members" className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {shown.map((member) => (
              <li key={member.id}>
                <button type="button" onClick={() => void pick(member)} className="flex min-h-11 w-full flex-col justify-center rounded-md px-3 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]">
                  <span className="truncate text-body-ui text-ink">{member.name}</span>
                  {member.unitName ? <span className="truncate text-caption text-ink-muted">{member.unitName}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {chosen ? <Button size="sm" variant="secondary" onClick={useSample}>Use sample</Button> : null}
      </PopoverContent>
    </Popover>
  );
}
