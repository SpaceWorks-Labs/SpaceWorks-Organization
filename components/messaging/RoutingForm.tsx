"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveMessagingRouting } from "@/app/actions/messaging-settings";
import { Button, IconButton } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { CHANNEL_LABELS, MAX_ROUTE_LENGTH, MEMBER_CHANNELS, MEMBER_MESSAGE_KINDS, MESSAGE_KIND_LABELS, routeFor, type MemberChannel, type MemberMessageKind, type Routing } from "@/lib/messages/kinds";

/**
 * Which channels each message uses, in order: the first one a member can be reached on sends it, and no other does. Email
 * is the last resort unless it is left out. Channels not connected for the organisation are shown but marked.
 */
export function RoutingForm({ slug, routing, available, quietStart, quietEnd, timezone, canEdit }: { slug: string; routing: Routing; available: MemberChannel[]; quietStart: string; quietEnd: string; timezone: string; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<Routing>(routing);
  const [start, setStart] = useState(quietStart);
  const [end, setEnd] = useState(quietEnd);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");

  const toggle = (kind: MemberMessageKind, channel: MemberChannel) => setValue((current) => {
    const list = [...routeFor(current, kind)];
    const at = list.indexOf(channel);
    if (at >= 0) list.splice(at, 1); else if (list.length < MAX_ROUTE_LENGTH) list.push(channel);
    return { ...current, [kind]: list };
  });
  // Rows are keyed by channel, so the focused button travels with its row; at an end it is aria-disabled, not disabled.
  const move = (kind: MemberMessageKind, channel: MemberChannel, by: -1 | 1) => {
    const list = [...routeFor(value, kind)];
    const at = list.indexOf(channel);
    if (at + by < 0 || at + by >= list.length) return;
    [list[at], list[at + by]] = [list[at + by], list[at]];
    setValue({ ...value, [kind]: list });
    setAnnouncement(`${CHANNEL_LABELS[channel]} is now ${at + by + 1} of ${list.length} for ${MESSAGE_KIND_LABELS[kind].title}.`);
  };
  const save = () => startTransition(async () => {
    const result = await saveMessagingRouting({ organisationSlug: slug, routing: value, quietStart: start, quietEnd: end });
    setMessage({ ok: result.ok, text: result.ok ? "Saved." : result.error ?? "That didn't save. Try again." });
    if (result.ok) router.refresh();
  });

  return (
    <Card as="section" className="max-w-[1100px] rounded-xl">
      <CardHeader title="Which channel each message uses" description="Choose the channels in the order to try them. A member gets each message once, on the first channel they have linked and agreed to; the rest are only a fallback. Without a choice, a message goes by email." />
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className="flex flex-col gap-4">
        {MEMBER_MESSAGE_KINDS.map((kind) => {
          const list = routeFor(value, kind);
          return (
            <fieldset key={kind} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <legend className="text-label text-ink">{MESSAGE_KIND_LABELS[kind].title}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {MEMBER_CHANNELS.map((channel) => {
                  const on = list.includes(channel);
                  const ready = channel === "EMAIL" || available.includes(channel);
                  return (
                    <Button key={channel} size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} disabled={!canEdit} onClick={() => toggle(kind, channel)}>
                      {on ? `${list.indexOf(channel) + 1}. ` : ""}{CHANNEL_LABELS[channel]}{ready ? "" : " (not connected)"}
                    </Button>
                  );
                })}
              </div>
              {list.length > 1 ? (
                <ol aria-label={`Order for ${MESSAGE_KIND_LABELS[kind].title}`} className="flex flex-col divide-y divide-line rounded-xl border border-line sm:max-w-md">
                  {list.map((channel, index) => (
                    <li key={channel} className="flex min-h-11 items-center gap-2 py-1 pl-3 pr-1">
                      <span className="w-5 shrink-0 text-label tabular-nums text-ink-muted">{index + 1}.</span>
                      <span className="min-w-0 flex-1 text-body-ui text-ink">{CHANNEL_LABELS[channel]}</span>
                      {canEdit ? (
                        <>
                          <IconButton label={`Try ${CHANNEL_LABELS[channel]} earlier for ${MESSAGE_KIND_LABELS[kind].title}`} size="sm" aria-disabled={index === 0 || undefined} onClick={() => move(kind, channel, -1)}><ArrowUp aria-hidden /></IconButton>
                          <IconButton label={`Try ${CHANNEL_LABELS[channel]} later for ${MESSAGE_KIND_LABELS[kind].title}`} size="sm" aria-disabled={index === list.length - 1 || undefined} onClick={() => move(kind, channel, 1)}><ArrowDown aria-hidden /></IconButton>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Quiet hours start" optional helperText={`Texts and chat messages wait until quiet hours end, in ${timezone}. Email is never held back.`}>
          <Input type="time" value={start} disabled={!canEdit} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Quiet hours end" optional>
          <Input type="time" value={end} disabled={!canEdit} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      {canEdit ? <div className="mt-4"><Button variant="primary" loading={pending} onClick={save}>Save routing</Button></div> : null}
    </Card>
  );
}
