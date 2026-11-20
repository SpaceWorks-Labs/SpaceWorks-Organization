import "server-only";

import { prisma } from "@/lib/db";
import { INSTANCE_SETTINGS_ID } from "@/lib/instanceSettings";
import { firebaseConfig, supabaseConfig } from "@/lib/authBridges";
import { getOAuthSettings } from "@/lib/oauthProviders";
import { listEnabledOidcProviders } from "@/lib/oidc/providers";
import { listEnabledSamlProviders } from "@/lib/saml/providers";
import { isEmailServiceConfigured } from "@/lib/emailAvailability";
import { isSmsConfigured } from "@/lib/sms/settings";
import {
  DEFAULT_SWITCHES,
  LOGIN_METHODS,
  LOGIN_SWITCH_FIELDS,
  availableMethods,
  loginMethodsFromEnv,
  resolveLoginMethods,
  type LoginMethod,
  type LoginSwitches,
  type MethodStatus,
} from "@/lib/loginMethodsCore";

/** Where a method's configuration comes from, for the super-admin page. */
export type ConfigSource = "settings" | "environment" | null;

/** The methods shown as one button each (the rest are the password form and the single sign-on provider lists). */
export const SOCIAL_METHODS = ["google", "apple", "github", "supabase", "firebase"] as const;
export type SocialMethod = (typeof SOCIAL_METHODS)[number];

export async function getLoginSwitches(): Promise<LoginSwitches> {
  const select = Object.fromEntries(Object.values(LOGIN_SWITCH_FIELDS).map((field) => [field, true]));
  const row = (await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select })) as Record<string, boolean> | null;
  if (!row) return DEFAULT_SWITCHES;
  return Object.fromEntries(LOGIN_METHODS.map((method) => [method, row[LOGIN_SWITCH_FIELDS[method]] ?? DEFAULT_SWITCHES[method]])) as LoginSwitches;
}

/** What the five instance-configuration reads return; kept briefly in this process, since every page asks. */
type StoredMethods = Awaited<ReturnType<typeof readStoredMethods>>;

const LOGIN_METHODS_TTL_MS = 30_000;
let stored: { at: number; value: Promise<StoredMethods> } | null = null;

/** Drop the kept copy; the actions that change sign-in methods, providers or SMS settings call this when they save. */
export function invalidateLoginMethodsCache() {
  stored = null;
}

function readStoredMethods() {
  return Promise.all([getLoginSwitches(), getOAuthSettings(), listEnabledOidcProviders(), listEnabledSamlProviders(), isSmsConfigured()]);
}

function storedMethods(): Promise<StoredMethods> {
  const now = Date.now();
  if (stored && now - stored.at < LOGIN_METHODS_TTL_MS) return stored.value;
  const value = readStoredMethods();
  stored = { at: now, value };
  value.catch(() => { if (stored?.value === value) stored = null; });
  return value;
}

/** Each method's state (switch AND configuration; LOGIN_METHODS wins over the database), plus the provider settings. */
export async function loadLoginMethods() {
  const [switches, oauth, oidc, saml, smsReady] = await storedMethods();
  const configured: Record<LoginMethod, boolean> = {
    password: true,
    google: oauth.google !== null,
    apple: oauth.apple !== null,
    github: oauth.github !== null,
    oidc: oidc.length > 0,
    saml: saml.length > 0,
    supabase: supabaseConfig() !== null,
    firebase: firebaseConfig() !== null,
    passkey: true,
    // Phone codes need an SMS provider (and nothing else: not an email service).
    phone: smsReady,
  };
  const statuses: MethodStatus[] = resolveLoginMethods({ switches, configured, envList: loginMethodsFromEnv() });
  return { statuses, available: availableMethods(statuses), oauth, switches, oidc, saml };
}

/** The methods that can be used right now, in display order. */
export async function availableLoginMethods(): Promise<LoginMethod[]> {
  return (await loadLoginMethods()).available;
}

/**
 * What the sign-in and invite pages need: whether passwords are on, the social buttons, the enabled single sign-on
 * providers (names only) and whether an email service exists ("Forgot?" is hidden without one).
 */
export async function loginPageMethods() {
  const [{ available, oidc, saml }, emailAvailable] = await Promise.all([loadLoginMethods(), isEmailServiceConfigured()]);
  return {
    passwordEnabled: available.includes("password"),
    passkeyEnabled: available.includes("passkey"),
    phoneEnabled: available.includes("phone"),
    providers: available.filter((method): method is SocialMethod => (SOCIAL_METHODS as readonly string[]).includes(method)),
    singleSignOn: [
      ...(available.includes("oidc") ? oidc.map((provider) => ({ kind: "oidc" as const, id: provider.id, slug: provider.slug, name: provider.name })) : []),
      ...(available.includes("saml") ? saml.map((provider) => ({ kind: "saml" as const, id: provider.id, slug: provider.slug, name: provider.name })) : []),
    ],
    emailAvailable,
  };
}

/** Where each method's configuration lives: Super admin settings (the database) or the server's environment. */
export async function loginConfigSources(): Promise<Record<LoginMethod, ConfigSource>> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: INSTANCE_SETTINGS_ID }, select: { googleClientId: true, githubClientId: true, appleClientId: true } });
  const env = process.env;
  const pick = (stored: string | null | undefined, ...names: string[]): ConfigSource => (stored ? "settings" : names.some((name) => env[name]) ? "environment" : null);
  return {
    password: null,
    google: pick(row?.googleClientId, "AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID"),
    apple: pick(row?.appleClientId, "AUTH_APPLE_ID"),
    github: pick(row?.githubClientId, "AUTH_GITHUB_ID"),
    oidc: null,
    saml: null,
    supabase: supabaseConfig() ? "environment" : null,
    firebase: firebaseConfig() ? "environment" : null,
    passkey: null,
    phone: null,
  };
}
