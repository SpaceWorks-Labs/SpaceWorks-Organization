"use client";

import { useState, useTransition } from "react";
import { saveLoginMethods } from "@/app/actions/login-methods";
import { Button } from "@/components/ui/button";
import { Callout, Card, SettingsRow } from "@/components/ui/display";
import { StatusPill, type ServiceState } from "@/components/super-admin/StatusPill";
import { Switch } from "@/components/ui/choice";
import { LOGIN_METHODS, LOGIN_METHOD_LABELS, PENDING_LOGIN_METHODS, type LoginMethod, type LoginSwitches, type MethodState } from "@/lib/loginMethodsCore";

type Row = { method: LoginMethod; state: MethodState; source: "settings" | "environment" | null };

const PILL: Record<MethodState, ServiceState> = { available: "available", switched_off: "switched_off", not_configured: "not_set_up" };
const SOURCE_LABEL = { settings: "Configured in settings", environment: "Configured in the server environment" } as const;

/** Each sign-in method's state and its switch. Read-only while the server's LOGIN_METHODS decides. */
export function LoginMethodsForm({ rows, initial, setByServer }: { rows: Row[]; initial: LoginSwitches; setByServer: boolean }) {
  const [switches, setSwitches] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () => startTransition(async () => {
    const result = await saveLoginMethods(switches);
    setStatus(result.ok ? { ok: true, text: "Sign-in methods saved." } : { ok: false, text: result.error });
  });
  return (
    <div className="flex flex-col gap-4">
      {setByServer ? <Callout tone="info">The server sets these with <code className="code-text">LOGIN_METHODS</code>, so they can&apos;t be changed here.</Callout> : null}
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Card padding="none" className="px-5">
        {LOGIN_METHODS.filter((method) => !PENDING_LOGIN_METHODS.includes(method)).map((method) => {
          const row = rows.find((entry) => entry.method === method)!;
          return (
            <SettingsRow
              key={method}
              title={LOGIN_METHOD_LABELS[method]}
              description={method === "password" ? "Super admins always sign in with a password, whatever this says." : method === "oidc" || method === "saml" ? "Works when this is on and at least one provider below is enabled." : row.source ? SOURCE_LABEL[row.source] : "No credentials yet."}
            >
              <div className="flex items-center gap-3">
                <StatusPill state={PILL[row.state]} />
                <Switch checked={switches[method]} disabled={setByServer || pending} onCheckedChange={(on) => setSwitches((current) => ({ ...current, [method]: on }))} aria-label={`${LOGIN_METHOD_LABELS[method]} sign-in`} />
              </div>
            </SettingsRow>
          );
        })}
      </Card>
      {setByServer ? null : <div><Button variant="primary" loading={pending} onClick={save}>Save sign-in methods</Button></div>}
    </div>
  );
}
