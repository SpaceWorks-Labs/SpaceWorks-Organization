"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveChatChannel } from "@/app/actions/chat-channels";
import { CHAT_EVENT_LABELS, CHAT_EVENTS, CHAT_KIND_LABELS, CHAT_KINDS, WHATSAPP_TEMPLATE, type ChatEvent, type ChatKind } from "@/lib/chat/events";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { CheckboxField, SwitchRow } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Input } from "@/components/ui/field";

export type ChannelRow = { id: string; kind: ChatKind; name: string; target: string; events: string[]; includeNames: boolean; enabled: boolean };

const HELP: Record<ChatKind, string> = {
  SLACK: "In Slack, add the Incoming Webhooks app to a channel and copy its webhook URL.",
  DISCORD: "In Discord, open the channel's settings, Integrations, Webhooks, New webhook, then Copy webhook URL.",
  MATTERMOST: "In Mattermost, Integrations, Incoming webhooks, Add, then copy the URL. Your server must be reachable over HTTPS.",
  TELEGRAM: "Create a bot with @BotFather, add it to your group or channel, and use the chat's ID (or @channelname).",
  WEBHOOK: "Your own address, on a public host over HTTPS. Each alert is posted as JSON ({ \"text\": … }) with x-spaceworks-timestamp and x-spaceworks-signature headers: sha256= and the HMAC-SHA256 of the timestamp, a full stop and the body, using your secret.",
  WHATSAPP: `Needs the WhatsApp Business Cloud API: create and get approved a utility template named ${WHATSAPP_TEMPLATE.name} whose body is just ${WHATSAPP_TEMPLATE.body}, then use a permanent access token.`,
};

const FIELDS: Record<ChatKind, Array<{ key: string; label: string; secret?: boolean; hint?: string }>> = {
  SLACK: [{ key: "webhookUrl", label: "Webhook URL", secret: true }],
  DISCORD: [{ key: "webhookUrl", label: "Webhook URL", secret: true }],
  MATTERMOST: [{ key: "webhookUrl", label: "Webhook URL", secret: true }],
  WEBHOOK: [{ key: "url", label: "Address", secret: true }, { key: "secret", label: "Signing secret", secret: true, hint: "At least 16 characters. Shown only once." }],
  TELEGRAM: [{ key: "botToken", label: "Bot token", secret: true }, { key: "chatId", label: "Chat ID", hint: "A number such as -1001234567890, or @channelname." }],
  WHATSAPP: [
    { key: "phoneNumberId", label: "Phone number ID" },
    { key: "accessToken", label: "Access token", secret: true },
    { key: "recipients", label: "Send to", hint: "Up to five numbers with the country code, separated by commas." },
    { key: "templateName", label: "Template name", hint: `Default ${WHATSAPP_TEMPLATE.name}.` },
    { key: "language", label: "Template language", hint: `Default ${WHATSAPP_TEMPLATE.language}.` },
  ],
};

/** Add a chat channel, or edit one (its saved destination stays unless new details are entered). */
export function ChatChannelDialog({ slug, channel, onClose }: { slug: string; channel: ChannelRow | null; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<ChatKind>(channel?.kind ?? "SLACK");
  const [name, setName] = useState(channel?.name ?? "");
  const [events, setEvents] = useState<ChatEvent[]>((channel?.events as ChatEvent[]) ?? ["application", "payment-to-confirm", "refund-requested"]);
  const [includeNames, setIncludeNames] = useState(channel?.includeNames ?? false);
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const touched = Object.values(fields).some((value) => value.trim());

  const config = () => {
    if (!touched) return undefined;
    if (kind !== "WHATSAPP") return fields;
    return { ...fields, recipients: (fields.recipients ?? "").split(",").map((number) => number.trim()).filter(Boolean), templateName: fields.templateName || WHATSAPP_TEMPLATE.name, language: fields.language || WHATSAPP_TEMPLATE.language };
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !pending ? onClose() : undefined)}>
      <DialogContent size="md">
        <DialogHeader title={channel ? `Edit ${channel.name}` : "Add a chat channel"} description="Team alerts only. Members never get messages here." />
        <DialogBody className="flex flex-col gap-4">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Service">
              <Dropdown value={kind} disabled={Boolean(channel)} onChange={(event) => { setKind(event.target.value as ChatKind); setFields({}); }}>
                {CHAT_KINDS.map((item) => <option key={item} value={item}>{CHAT_KIND_LABELS[item]}</option>)}
              </Dropdown>
            </Field>
            <Field label="Name" helperText="Only for you, for example Treasurers or #membership.">
              <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </Field>
          </div>
          <p className="text-caption text-ink-muted">{HELP[kind]}</p>
          {channel ? <p className="text-caption text-ink-secondary">Posting to {channel.target}. Fill these in only to change it.</p> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS[kind].map((field) => (
              <Field key={field.key} label={field.label} helperText={field.hint} optional={Boolean(channel)}>
                <Input type={field.secret ? "password" : "text"} autoComplete="off" spellCheck={false} value={fields[field.key] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))} />
              </Field>
            ))}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-semibold text-ink">Alerts</legend>
            {CHAT_EVENTS.map((event) => (
              <CheckboxField key={event} label={CHAT_EVENT_LABELS[event]} checked={events.includes(event)} onCheckedChange={(checked) => setEvents((current) => (checked === true ? [...current, event] : current.filter((item) => item !== event)))} />
            ))}
          </fieldset>
          <SwitchRow label="Show member names" description="Off: alerts name members by number only. Erasure requests never show a name." checked={includeNames} onCheckedChange={(checked) => setIncludeNames(checked === true)} />
          <SwitchRow label="Channel on" checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={() => startTransition(async () => {
            const result = await saveChatChannel({ organisationSlug: slug, channelId: channel?.id, kind, name, events, includeNames, enabled, config: config() });
            if (!result.ok) return setError(result.error);
            router.refresh();
            onClose();
          })}>{channel ? "Save channel" : "Add channel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
