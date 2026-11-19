"use client";

import { useState, useTransition } from "react";
import { deleteSamlProvider, saveSamlProvider, testSamlProvider } from "@/app/actions/saml-providers";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, ReadOnlyValue, Textarea } from "@/components/ui/field";
import { SwitchRow } from "@/components/ui/choice";
import { ProviderEditorFrame, ProviderList } from "@/components/super-admin/ProviderList";

export type SamlRow = {
  id: string; slug: string; name: string; entityId: string; ssoUrl: string; idpCertificate: string; spEntityId: string | null;
  enabled: boolean; wantAssertionsSigned: boolean; acsUrl: string; metadataUrl: string;
};

const blank = { id: undefined as string | undefined, slug: "", name: "", entityId: "", ssoUrl: "", idpCertificate: "", spEntityId: "", enabled: false, wantAssertionsSigned: true };

function Editor({ row, onDone }: { row: SamlRow | null; onDone: () => void }) {
  const [form, setForm] = useState(row ? { id: row.id, slug: row.slug, name: row.name, entityId: row.entityId, ssoUrl: row.ssoUrl, idpCertificate: row.idpCertificate, spEntityId: row.spEntityId ?? "", enabled: row.enabled, wantAssertionsSigned: row.wantAssertionsSigned } : blank);
  const [metadataUrl, setMetadataUrl] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const save = () => start(async () => {
    const result = await saveSamlProvider(form);
    if (result.ok) onDone(); else setStatus({ ok: false, text: result.error });
  });
  const test = () => start(async () => {
    const result = await testSamlProvider({ ssoUrl: form.ssoUrl, entityId: form.entityId, idpCertificate: form.idpCertificate, metadataUrl });
    const data = result.ok ? result.data : undefined;
    if (!data) return setStatus({ ok: false, text: result.ok ? "The test gave no answer." : result.error });
    setStatus(data.ok ? { ok: true, text: data.notes.join(" ") } : { ok: false, text: data.error });
  });
  return (
    <ProviderEditorFrame title={row ? `Edit ${row.name}` : "Add a SAML provider"}>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Field label="Name" helperText="Shown on the sign-in button."><Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>
      <Field label="Short name" helperText="Lowercase letters, digits and hyphens. Part of the sign-in and response addresses."><Input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} maxLength={32} /></Field>
      <Field label="Identity provider entity ID"><Input value={form.entityId} onChange={(e) => set({ entityId: e.target.value })} /></Field>
      <Field label="Sign-on address" helperText="The identity provider's https single sign-on address (HTTP-Redirect)."><Input value={form.ssoUrl} onChange={(e) => set({ ssoUrl: e.target.value })} inputMode="url" /></Field>
      <Field label="Identity provider certificate" helperText="Its public certificate (PEM). Never paste a private key."><Textarea value={form.idpCertificate} onChange={(e) => set({ idpCertificate: e.target.value })} rows={5} spellCheck={false} /></Field>
      <Field label="Our entity ID" optional helperText="Leave blank to use the metadata address."><Input value={form.spEntityId} onChange={(e) => set({ spEntityId: e.target.value })} /></Field>
      <Field label="Metadata address to check" optional helperText="Only used by Test connection; not saved."><Input value={metadataUrl} onChange={(e) => setMetadataUrl(e.target.value)} inputMode="url" /></Field>
      {row ? <><Field label="Response address (ACS)" helperText="Give these two to the identity provider."><ReadOnlyValue value={row.acsUrl} /></Field><Field label="Our metadata"><ReadOnlyValue value={row.metadataUrl} /></Field></> : null}
      <SwitchRow label="Require signed assertions" description="Recommended. Refuses assertions the identity provider has not signed." checked={form.wantAssertionsSigned} onCheckedChange={(wantAssertionsSigned) => set({ wantAssertionsSigned })} />
      <SwitchRow label="Show on the sign-in page" description="Works once SAML is switched on above." checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending} onClick={save}>Save provider</Button>
        <Button variant="secondary" disabled={pending} onClick={test}>Test connection</Button>
        <Button variant="quiet" disabled={pending} onClick={onDone}>Cancel</Button>
      </div>
    </ProviderEditorFrame>
  );
}

/** The operator's SAML 2.0 providers: list, add, edit, remove. */
export function SamlProviders({ rows }: { rows: SamlRow[] }) {
  return <ProviderList rows={rows} kind="SAML" detail={(row) => row.entityId} onRemove={deleteSamlProvider} editor={(row, done) => <Editor key={row?.id ?? "new"} row={row} onDone={done} />} />;
}
