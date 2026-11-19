"use client";

import { signIn } from "next-auth/react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrDivider } from "./OrDivider";

export type SocialProvider = "google" | "apple" | "github" | "supabase" | "firebase";

/** An enabled OpenID Connect or SAML provider: one button each, named by the operator. */
export type SingleSignOnProvider = { kind: "oidc" | "saml"; id: string; slug: string; name: string };

function GoogleMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden className="block">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.48 1.22 8.9 3.4l6.6-6.6C35.52 2.8 30.12 0 24 0 14.64 0 6.56 5.38 2.6 13.2l7.74 6.02C12.2 13.1 17.62 9.5 24 9.5z" />
      <path fill="#4285F4" d="M47.5 24.5c0-1.62-.14-3.18-.4-4.7H24v9.02h13.2c-.58 3-2.28 5.54-4.84 7.26l7.44 5.78C44.2 37.9 47.5 31.8 47.5 24.5z" />
      <path fill="#FBBC05" d="M10.34 28.52A14.5 14.5 0 0 1 9.5 24c0-1.58.26-3.1.84-4.52L2.6 13.2A23.94 23.94 0 0 0 0 24c0 3.88.94 7.54 2.6 10.8l7.74-6.28z" />
      <path fill="#34A853" d="M24 48c6.12 0 11.52-2.02 15.8-5.52l-7.44-5.78c-2.06 1.4-4.7 2.22-8.36 2.22-6.38 0-11.8-3.6-13.66-9.42L2.6 34.8C6.56 42.62 14.64 48 24 48z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden className="block fill-current">
      <path d="M16.37 12.8c-.02-2.15 1.76-3.19 1.84-3.24-1-1.47-2.56-1.67-3.12-1.69-1.33-.13-2.59.78-3.27.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.53 2.14-1.5 2.61-.38 6.48 1.08 8.6.72 1.03 1.57 2.2 2.69 2.16 1.08-.04 1.49-.7 2.79-.7 1.3 0 1.67.7 2.81.68 1.16-.02 1.9-1.05 2.61-2.09.82-1.2 1.16-2.36 1.18-2.42-.03-.01-2.26-.87-2.28-3.46zM14.23 6.47c.6-.72 1-1.73.89-2.73-.86.03-1.9.57-2.51 1.29-.55.64-1.03 1.66-.9 2.64.95.07 1.92-.48 2.52-1.2z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden className="block fill-current">
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.82-.26.82-.57v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3" />
    </svg>
  );
}

function NeutralMark() {
  return <KeyRound size={18} aria-hidden className="block" />;
}

/** Brand marks only for Google, Apple and GitHub; every other provider gets the neutral key. */
const PROVIDERS: Record<SocialProvider, { name: string; Mark: () => React.ReactElement }> = {
  google: { name: "Google", Mark: GoogleMark },
  apple: { name: "Apple", Mark: AppleMark },
  github: { name: "GitHub", Mark: GitHubMark },
  supabase: { name: "Supabase", Mark: NeutralMark },
  firebase: { name: "Firebase", Mark: NeutralMark },
};
const SOCIAL: SocialProvider[] = ["google", "apple", "github"];

/**
 * One button per sign-in provider this instance has switched on, in the UX P22 order: Google, Apple and GitHub first,
 * then single sign-on (OpenID Connect, SAML, Supabase, Firebase), then the "or" divider. With four or more buttons
 * the brand trio sits in one row so the stack stays short. Renders nothing when no provider is on.
 */
export function SocialSignIn({
  providers,
  singleSignOn = [],
  callbackUrl,
  disabled,
  onStart,
  onError,
  dividerLabel = "or with email",
}: {
  providers: SocialProvider[];
  singleSignOn?: SingleSignOnProvider[];
  callbackUrl: string;
  disabled?: boolean;
  /** Text between the buttons and the form below; empty when nothing follows. */
  dividerLabel?: string;
  onStart: (provider: SocialProvider | "sso") => void;
  onError: (message: string) => void;
}) {
  const social = SOCIAL.filter((provider) => providers.includes(provider));
  const bridges = providers.filter((provider) => !SOCIAL.includes(provider));
  if (social.length + bridges.length + singleSignOn.length === 0) return null;
  const compact = social.length >= 2 && social.length + bridges.length + singleSignOn.length >= 4;

  const start = (provider: SocialProvider) => {
    onStart(provider);
    if (provider === "supabase" || provider === "firebase") {
      // These open the provider's own sign-in on the bridge page, which finishes the sign-in here.
      window.location.assign(new URL(`/login/bridge/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`, window.location.origin).href);
      return;
    }
    void signIn(provider, { callbackUrl }).catch(() => onError(`${PROVIDERS[provider].name} sign-in is temporarily unavailable. Please try again.`));
  };
  const startSso = (entry: SingleSignOnProvider) => {
    onStart("sso");
    if (entry.kind === "saml") {
      // SAML is a redirect to the identity provider and back through the site's own routes.
      window.location.assign(new URL(`/api/auth/saml/${encodeURIComponent(entry.slug)}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, window.location.origin).href);
      return;
    }
    void signIn(`oidc-${entry.id}`, { callbackUrl }).catch(() => onError(`${entry.name} sign-in is temporarily unavailable. Please try again.`));
  };
  const button = (key: string, label: string, Mark: () => React.ReactElement, onClick: () => void, short?: string) => (
    <Button key={key} variant="secondary" size="lg" fullWidth disabled={disabled} aria-label={short ? label : undefined} className="px-4" onClick={onClick}>
      <Mark />
      <span className="min-w-0 truncate">{short ?? label}</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {social.length ? (
        <div className={compact ? "grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2" : "flex flex-col gap-2"}>
          {social.map((provider) => button(provider, `Continue with ${PROVIDERS[provider].name}`, PROVIDERS[provider].Mark, () => start(provider), compact ? PROVIDERS[provider].name : undefined))}
        </div>
      ) : null}
      {bridges.length || singleSignOn.length ? (
        <div className="flex flex-col gap-2">
          {singleSignOn.map((entry) => button(`${entry.kind}-${entry.slug}`, `Continue with ${entry.name}`, NeutralMark, () => startSso(entry)))}
          {bridges.map((provider) => button(provider, `Continue with ${PROVIDERS[provider].name}`, PROVIDERS[provider].Mark, () => start(provider)))}
        </div>
      ) : null}
      {dividerLabel ? <OrDivider label={dividerLabel} /> : null}
    </div>
  );
}
