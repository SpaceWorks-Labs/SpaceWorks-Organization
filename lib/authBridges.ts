/**
 * Supabase Auth and Firebase Auth as identity bridges. Configuration comes from the environment only and is
 * public by design (a project URL and a publishable key); nothing here is a secret. Pure: no database, no network.
 */
import { loginMethodsFromEnv } from "@/lib/loginMethodsCore";

type Env = Record<string, string | undefined>;

export type SupabaseConfig = { url: string; anonKey: string; providers: string[] };
export type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string | null; providers: string[] };

const word = /^[a-zA-Z0-9_.-]{1,40}$/;
const list = (value: string | undefined, fallback: string[]) => {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter((item) => word.test(item));
  return items.length ? [...new Set(items)] : fallback;
};

/** The Firebase sign-in choices the bridge page can open: popup providers, plus email link and password. */
export const FIREBASE_POPUP_PROVIDERS = ["google.com", "microsoft.com", "apple.com", "github.com", "facebook.com", "twitter.com", "yahoo.com"] as const;
export const FIREBASE_EMAIL_PROVIDERS = ["emailLink", "password"] as const;

/** A bare https origin, or plain http on this machine for development. */
export function bareOrigin(value: string | undefined): string | null {
  if (!value) return null;
  if (/^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(value)) return value.toLowerCase();
  return null;
}

export function supabaseConfig(env: Env = process.env): SupabaseConfig | null {
  const url = bareOrigin(env.AUTH_SUPABASE_URL?.trim());
  const anonKey = env.AUTH_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey || anonKey.length > 2000 || /\s/.test(anonKey)) return null;
  return { url, anonKey, providers: list(env.AUTH_SUPABASE_PROVIDERS, ["email"]) };
}

export function firebaseConfig(env: Env = process.env): FirebaseConfig | null {
  const apiKey = env.AUTH_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = env.AUTH_FIREBASE_AUTH_DOMAIN?.trim().toLowerCase() ?? "";
  const projectId = env.AUTH_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (!/^[\w-]{10,200}$/.test(apiKey) || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(authDomain) || !authDomain.includes(".") || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) return null;
  const appId = env.AUTH_FIREBASE_APP_ID?.trim();
  const known: readonly string[] = [...FIREBASE_POPUP_PROVIDERS, ...FIREBASE_EMAIL_PROVIDERS];
  const providers = list(env.AUTH_FIREBASE_PROVIDERS, ["google.com"]).filter((item) => known.includes(item));
  return { apiKey, authDomain, projectId, appId: appId && /^[\w:.-]{1,200}$/.test(appId) ? appId : null, providers: providers.length ? providers : ["google.com"] };
}

/** The hosts a page needs while a bridge is configured and not left out by LOGIN_METHODS (CSP; environment only). */
export function bridgeCspHosts(env: Env = process.env): { connect: string[]; frame: string[]; script: string[] } {
  const connect: string[] = [];
  const frame: string[] = [];
  const script: string[] = [];
  const listed = loginMethodsFromEnv(env);
  const supabase = !listed || listed.includes("supabase") ? supabaseConfig(env) : null;
  if (supabase) connect.push(supabase.url);
  const firebase = !listed || listed.includes("firebase") ? firebaseConfig(env) : null;
  if (firebase) {
    connect.push("https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com");
    frame.push(`https://${firebase.authDomain}`, "https://apis.google.com");
    script.push("https://apis.google.com");
  }
  return { connect, frame, script };
}
