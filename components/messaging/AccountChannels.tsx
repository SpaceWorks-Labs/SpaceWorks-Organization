"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmPhoneLink, removeEndpoint, setChannelConsent, startChatLink, startPhoneLink, type LinkStart } from "@/app/actions/messaging-account";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { SwitchRow } from "@/components/ui/choice";
import { CHANNEL_LABELS } from "@/lib/messages/kinds";
import type { NotificationsOrg } from "@/lib/views/app__account__notifications__page";

type Offer = NotificationsOrg["channels"][number];

const HOW: Record<string, string> = {
  TELEGRAM: "Open the link and press Start in Telegram.",
  SLACK: "Send this code to the app in a direct message in Slack.",
  DISCORD: "In Discord, use the /link command with this code.",
  MATTERMOST: "In Mattermost, type /link followed by this code.",
};

/** Link one channel (a one-time code for chat, a texted code for a number), then choose per organisation whether to get messages on it. */
function ChannelRow({ offer, organisation, slug }: { offer: Offer; organisation: string; slug: string }) {
  const router = useRouter();
  const phone = offer.channel === "SMS" || offer.channel === "WHATSAPP";
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [started, setStarted] = useState<LinkStart | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const label = CHANNEL_LABELS[offer.channel];
  const key = { channel: offer.channel, scope: offer.scope };
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done?: string) => start(async () => {
    const result = await action();
    setMessage(result.ok ? (done ? { ok: true, text: done } : null) : { ok: false, text: result.error ?? "That didn't work. Try again." });
    if (result.ok) router.refresh();
  });

  return (
    <li className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-label text-ink">{label}</span>
        {offer.linked ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeEndpoint(key), "Unlinked.")}>Unlink {label}</Button> : null}
      </div>
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"}>{message.text}</Callout> : null}
      {offer.linked ? (
        <SwitchRow label={`Send me ${organisation}'s messages on ${label}`} description="Every message has a link to stop, and replying STOP works too." checked={offer.consent} disabled={pending} onCheckedChange={(on) => run(() => setChannelConsent({ ...key, organisationSlug: slug, on }))} />
      ) : !offer.canVerify ? (
        <p className="text-body-ui text-ink-secondary">This can&apos;t be linked yet: numbers are verified by text message, which isn&apos;t set up here.</p>
      ) : phone ? (
        <div className="flex flex-col gap-3">
          <Field label={`${label} number`} helperText="With its country code, such as +91 98765 43210. We text a code to it."><Input value={number} inputMode="tel" autoComplete="tel" onChange={(event) => setNumber(event.target.value)} /></Field>
          {sent ? <Field label="Code from the text"><Input value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} /></Field> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant={sent ? "secondary" : "primary"} loading={pending} onClick={() => run(async () => { const result = await startPhoneLink({ ...key, phone: number }); if (result.ok) setSent(true); return result; }, "Code sent.")}>{sent ? "Send a new code" : "Send a code"}</Button>
            {sent ? <Button variant="primary" loading={pending} onClick={() => run(() => confirmPhoneLink({ ...key, phone: number, code }), "Linked. Now choose whether to use it.")}>Link number</Button> : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {started ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-4" aria-live="polite">
              <p className="text-body-ui text-ink-secondary">{HOW[offer.channel]} It works for 15 minutes, once.</p>
              <p className="code-text text-lg text-ink">{started.code}</p>
              {started.link ? <a className="inline-flex min-h-11 w-fit items-center text-label font-semibold text-ink underline underline-offset-4" href={started.link} rel="noreferrer noopener" target="_blank">Open Telegram<span className="sr-only"> (opens in a new tab)</span></a> : null}
              <p className="text-caption text-ink-muted">When it&apos;s done, check here to see it linked.</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {started ? <Button variant="secondary" disabled={pending} onClick={() => router.refresh()}>Check the link</Button> : null}
            <Button variant={started ? "ghost" : "primary"} loading={pending} onClick={() => start(async () => { const result = await startChatLink(key); if (result.ok && result.data) { setStarted(result.data); setMessage(null); } else if (!result.ok) setMessage({ ok: false, text: result.error }); })}>{started ? "Make a new code" : `Link ${label}`}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AccountChannels({ organisations }: { organisations: NotificationsOrg[] }) {
  return (
    <div className="flex flex-col gap-6">
      {organisations.map((org) => (
        <Card as="section" key={org.slug} className="rounded-xl" aria-label={org.name}>
          <CardHeader title={org.name} description="Email always works. Add another way to hear from this organisation, and say when to use it." />
          {org.channels.length === 0 ? <p className="text-body-ui text-ink-secondary">This organisation only sends email.</p> : <ul className="flex flex-col gap-4">{org.channels.map((offer) => <ChannelRow key={`${offer.channel}-${offer.scope}`} offer={offer} organisation={org.name} slug={org.slug} />)}</ul>}
        </Card>
      ))}
    </div>
  );
}
