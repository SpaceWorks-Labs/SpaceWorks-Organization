"use client";

import { useState, useTransition } from "react";
import { saveSignInProviders } from "@/app/actions/sign-in-providers";
import { Button } from "@/components/ui/button";
import { Callout, Card, SettingsRow } from "@/components/ui/display";
import { Field, Input, PasswordInput, Textarea } from "@/components/ui/field";

type SignInProviderValues = {
  googleClientId: string;
  githubClientId: string;
  appleClientId: string;
  appleTeamId: string;
  appleKeyId: string;
  hasGoogleSecret: boolean;
  hasGithubSecret: boolean;
  hasAppleKey: boolean;
  callbackBase: string;
};

/** Google, GitHub and Apple sign-in. Secrets are write-only; leaving one blank keeps the saved value. */
export function SignInProvidersForm({ initial }: { initial: SignInProviderValues }) {
  const [values, setValues] = useState(initial);
  const [secrets, setSecrets] = useState({ google: "", github: "", apple: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SignInProviderValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const callback = (provider: string) => `${initial.callbackBase}/api/auth/callback/${provider}`;

  const submit = () =>
    startTransition(async () => {
      setStatus(null);
      const result = await saveSignInProviders({
        googleClientId: values.googleClientId,
        googleClientSecret: secrets.google,
        githubClientId: values.githubClientId,
        githubClientSecret: secrets.github,
        appleClientId: values.appleClientId,
        appleTeamId: values.appleTeamId,
        appleKeyId: values.appleKeyId,
        applePrivateKey: secrets.apple,
      });
      if (result.ok) {
        setValues((current) => ({
          ...current,
          hasGoogleSecret: current.hasGoogleSecret || Boolean(secrets.google),
          hasGithubSecret: current.hasGithubSecret || Boolean(secrets.github),
          hasAppleKey: current.hasAppleKey || Boolean(secrets.apple),
        }));
        setSecrets({ google: "", github: "", apple: "" });
      }
      setStatus(result.ok ? { ok: true, text: "Sign-in providers saved." } : { ok: false, text: result.error });
    });

  const keep = (has: boolean, label: string) => (has ? `${label} (leave blank to keep current)` : label);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      <Card padding="none" className="rounded-xl px-5">
        <SettingsRow title="Google" description={`Callback URL: ${callback("google")}`}>
          <div className="flex flex-col gap-4">
            <Field label="Client ID" optional>
              <Input value={values.googleClientId} onChange={(event) => set("googleClientId", event.target.value)} />
            </Field>
            <Field label={keep(values.hasGoogleSecret, "Client secret")}>
              <PasswordInput value={secrets.google} onChange={(event) => setSecrets((s) => ({ ...s, google: event.target.value }))} autoComplete="new-password" />
            </Field>
          </div>
        </SettingsRow>
        <SettingsRow title="GitHub" description={`Callback URL: ${callback("github")}. Only verified GitHub emails can sign in.`}>
          <div className="flex flex-col gap-4">
            <Field label="Client ID" optional>
              <Input value={values.githubClientId} onChange={(event) => set("githubClientId", event.target.value)} />
            </Field>
            <Field label={keep(values.hasGithubSecret, "Client secret")}>
              <PasswordInput value={secrets.github} onChange={(event) => setSecrets((s) => ({ ...s, github: event.target.value }))} autoComplete="new-password" />
            </Field>
          </div>
        </SettingsRow>
        <SettingsRow title="Apple" description={`Return URL: ${callback("apple")}. Uses a Services ID and a Sign in with Apple key.`}>
          <div className="flex flex-col gap-4">
            <Field label="Services ID" optional>
              <Input value={values.appleClientId} onChange={(event) => set("appleClientId", event.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Team ID" optional>
                <Input value={values.appleTeamId} onChange={(event) => set("appleTeamId", event.target.value)} />
              </Field>
              <Field label="Key ID" optional>
                <Input value={values.appleKeyId} onChange={(event) => set("appleKeyId", event.target.value)} />
              </Field>
            </div>
            <Field label={keep(values.hasAppleKey, "Private key (.p8)")}>
              <Textarea rows={4} value={secrets.apple} onChange={(event) => setSecrets((s) => ({ ...s, apple: event.target.value }))} spellCheck={false} className="font-mono text-[13px]" />
            </Field>
          </div>
        </SettingsRow>
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={pending}>Save sign-in providers</Button>
      </div>
    </form>
  );
}
