"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { deleteChatChannel, testChatChannel } from "@/app/actions/chat-channels";
import { CHAT_EVENT_LABELS, CHAT_KIND_LABELS, type ChatEvent } from "@/lib/chat/events";
import { ChatChannelDialog, type ChannelRow } from "@/components/settings/ChatChannelDialog";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";

type Row = ChannelRow & { lastDelivered: string | null; lastError: string | null };

/** The organisation's chat channels: add, edit, test or remove, with each one's last delivery. */
export function ChatChannelsPanel({ slug, channels, canEdit, secretsReady }: { slug: string; channels: Row[]; canEdit: boolean; secretsReady: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ChannelRow | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => startTransition(async () => {
    const result = await work();
    setMessage(result.ok ? { ok: true, text: done } : { ok: false, text: result.error ?? "That didn't work." });
    setRemoving(null);
    router.refresh();
  });

  return (
    <Card as="section" className="max-w-[860px] rounded-xl">
      <CardHeader
        title="Chat alerts"
        description="Tell your team in Slack, Discord, Mattermost, Telegram or WhatsApp when something needs them. Each channel picks its alerts."
        action={canEdit && secretsReady ? <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus aria-hidden className="size-4" />Add channel</Button> : undefined}
      />
      {!secretsReady ? <Callout tone="warning" className="mb-3">Chat channels need PAYMENT_SECRETS_KEY set on the server to keep their tokens encrypted.</Callout> : null}
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      {channels.length === 0 ? (
        <EmptyState mood="sleepy" title="No chat channels yet">Add one to hear about new applications, payments to confirm and refund requests where your team already talks.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {channels.map((channel) => (
            <li key={channel.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
              <MessageSquare aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-[1_1_260px]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-label font-semibold text-ink">{channel.name}</span>
                  <Chip size="sm" tone="outline">{CHAT_KIND_LABELS[channel.kind]}</Chip>
                  {!channel.enabled ? <Chip size="sm">Switched off</Chip> : null}
                </span>
                <span className="block break-words text-caption text-ink-muted">{channel.target} · {channel.events.map((event) => CHAT_EVENT_LABELS[event as ChatEvent]).join(", ")}</span>
                {channel.lastError ? <span className="block text-caption text-danger-fg">Last attempt failed: {channel.lastError}</span> : channel.lastDelivered ? <span className="block text-caption text-ink-muted">Last delivered {channel.lastDelivered}</span> : null}
              </span>
              {canEdit ? (
                <span className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" disabled={pending} aria-label={`Send a test to ${channel.name}`} onClick={() => run(() => testChatChannel({ organisationSlug: slug, channelId: channel.id }), `Test sent to ${channel.name}.`)}>Send test</Button>
                  <Button size="sm" variant="quiet" aria-label={`Edit ${channel.name}`} onClick={() => setEditing(channel)}>Edit</Button>
                  <Button size="sm" variant="dangerQuiet" aria-label={`Remove ${channel.name}`} onClick={() => setRemoving(channel)}>Remove</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? <ChatChannelDialog slug={slug} channel={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name ?? "this channel"}?`}
        message="Its alerts stop straight away. Alerts already queued for it are dropped."
        confirmLabel="Remove channel"
        loading={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && run(() => deleteChatChannel({ organisationSlug: slug, channelId: removing.id }), "Channel removed.")}
      />
    </Card>
  );
}
