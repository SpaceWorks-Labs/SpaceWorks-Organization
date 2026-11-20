"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWhatsAppTemplate, saveWhatsAppTemplate } from "@/app/actions/messaging-settings";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { MEMBER_MESSAGE_KINDS, MESSAGE_KIND_LABELS, WHATSAPP_VARIABLES, type MemberMessageKind } from "@/lib/messages/kinds";

type Row = { kind: string; language: string; name: string; variables: string[] };

/**
 * WhatsApp only lets a business start a conversation with an approved template, so each message kind and language is
 * mapped to one: its name (a Twilio content SID, or a Meta template name) and the ordered placeholders that fill {{1}}, {{2}}…
 * Leave the stop link as the last variable so every message carries it. `slug` is the organisation's; without it, the platform's.
 */
export function WhatsAppTemplates({ slug, rows, canEdit }: { slug?: string; rows: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<MemberMessageKind>("renewal-due");
  const [language, setLanguage] = useState("en");
  const [name, setName] = useState("");
  const [variables, setVariables] = useState("name, organisation, validUntil, payLink");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    const result = await action();
    setMessage({ ok: result.ok, text: result.ok ? done : result.error ?? "That didn't save. Try again." });
    if (result.ok) router.refresh();
  });
  const list = variables.split(/[,\s]+/).filter(Boolean);

  return (
    <Card as="section" className="max-w-[860px] rounded-xl">
      <CardHeader title="WhatsApp templates" description={`Map each message to its approved template. Variables, in order, from: ${WHATSAPP_VARIABLES.join(", ")}.`} />
      {message ? <Callout tone={message.ok ? "success" : "danger"} role={message.ok ? "status" : "alert"} className="mb-3">{message.text}</Callout> : null}
      {rows.length === 0 ? <p className="mb-3 text-body-ui text-ink-secondary">No templates yet, so WhatsApp is skipped for every message.</p> : (
        <ul className="mb-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.language}`} className="flex flex-wrap items-center justify-between gap-2 text-body-ui text-ink">
              <span className="min-w-0 break-words">{MESSAGE_KIND_LABELS[row.kind as MemberMessageKind]?.title ?? row.kind} ({row.language}): <span className="code-text">{row.name}</span> with {row.variables.join(", ") || "no variables"}</span>
              {canEdit ? <Button size="sm" variant="ghost" disabled={pending} aria-label={`Remove the ${MESSAGE_KIND_LABELS[row.kind as MemberMessageKind]?.title ?? row.kind} (${row.language}) template`} onClick={() => run(() => deleteWhatsAppTemplate({ organisationSlug: slug, kind: row.kind, language: row.language }), "Removed.")}>Remove</Button> : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Message">
            <Dropdown value={kind} onChange={(event) => setKind(event.target.value as MemberMessageKind)}>
              {MEMBER_MESSAGE_KINDS.map((item) => <option key={item} value={item}>{MESSAGE_KIND_LABELS[item].title}</option>)}
            </Dropdown>
          </Field>
          <Field label="Language code" helperText="As the template was approved, such as en or en_US."><Input value={language} onChange={(event) => setLanguage(event.target.value)} /></Field>
          <Field label="Template name or content SID"><Input value={name} autoComplete="off" onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Variables, in order" helperText="Separated by commas."><Input value={variables} autoComplete="off" onChange={(event) => setVariables(event.target.value)} /></Field>
          <div className="md:col-span-2">
            <Button variant="primary" loading={pending} onClick={() => run(() => saveWhatsAppTemplate({ organisationSlug: slug, kind, language, name, variables: list }), "Saved.")}>Save template</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
