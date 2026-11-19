"use client";

import { useState, useTransition } from "react";
import { deleteOidcProvider, saveOidcProvider, testOidcProvider } from "@/app/actions/oidc-providers";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, ReadOnlyValue } from "@/components/ui/field";
import { SwitchRow } from "@/components/ui/choice";
import { SecretField } from "@/components/settings/SecretField";
import { ProviderEditorFrame, ProviderList } from "@/components/super-admin/ProviderList";

export type OidcRow = { id: string; slug: string; name: string; issuer: string; clientId: string; scopes: string; enabled: boolean; callbackUrl: string };

const blank = { id: undefined as string | undefined, slug: "", name: "", issuer: "", clientId: "", clientSecret: "", scopes: "openid email profile", enabled: false };

function Editor({ row, onDone }: { row: OidcRow | null; onDone: () => void }) {
  const [form, setForm] = useState(row ? { id: row.id, slug: row.slug, name: row.name, issuer: row.issuer, clientId: row.clientId, clientSecret: "", scopes: row.scopes, enabled: row.enabled } : blank);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const save = () => start(async () => {
    const result = await saveOidcProvider(form);
    if (result.ok) onDone(); else setStatus({ ok: false, text: result.error });
  });
  const test = () => start(async () => {
    const result = await testOidcProvider(form.issuer);
    const data = result.ok ? result.data : undefined;
    if (!data) return setStatus({ ok: false, text: result.ok ? "The test gave no answer." : result.error });
    setStatus(data.ok ? { ok: true, text: "Connected: the issuer's discovery document matches and its endpoints are https." } : { ok: false, text: data.error });
  });
  return (
    <ProviderEditorFrame title={row ? `Edit ${row.name}` : "Add an OpenID Connect provider"}>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Field label="Name" helperText="Shown on the sign-in button."><Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>
      <Field label="Short name" helperText="Lowercase letters, digits and hyphens. Part of the callback address."><Input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} maxLength={32} /></Field>
      <Field label="Issuer" helperText="The https address of the identity provider, as its discovery document names it."><Input value={form.issuer} onChange={(e) => set({ issuer: e.target.value })} inputMode="url" /></Field>
      <Field label="Client ID"><Input value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} autoComplete="off" /></Field>
      <SecretField label="Client secret" saved={Boolean(row)} value={form.clientSecret} onChange={(clientSecret) => set({ clientSecret })} />
      <Field label="Scopes"><Input value={form.scopes} onChange={(e) => set({ scopes: e.target.value })} /></Field>
      {row ? <Field label="Redirect (callback) address" helperText="Register this with the identity provider."><ReadOnlyValue value={row.callbackUrl} /></Field> : null}
      <SwitchRow label="Show on the sign-in page" description="Works once OpenID Connect is switched on above." checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending} onClick={save}>Save provider</Button>
        <Button variant="secondary" disabled={pending} onClick={test}>Test connection</Button>
        <Button variant="quiet" disabled={pending} onClick={onDone}>Cancel</Button>
      </div>
    </ProviderEditorFrame>
  );
}

/** The operator's OpenID Connect providers: list, add, edit, remove. Secrets are write-only. */
export function OidcProviders({ rows }: { rows: OidcRow[] }) {
  return <ProviderList rows={rows} kind="OpenID Connect" detail={(row) => row.issuer} onRemove={deleteOidcProvider} editor={(row, done) => <Editor key={row?.id ?? "new"} row={row} onDone={done} />} />;
}
