import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SWITCHES, availableMethods, loginMethodsFromEnv, parseLoginMethodList, resolveLoginMethods, type LoginMethod } from "@/lib/loginMethodsCore";
import { bridgeCspHosts, firebaseConfig, supabaseConfig } from "@/lib/authBridges";

const mocks = vi.hoisted(() => ({ row: null as Record<string, boolean> | null, oauth: { google: null, github: null, apple: null } as Record<string, unknown>, oidc: [] as unknown[], saml: [] as unknown[], email: true }));
vi.mock("@/lib/db", () => ({ prisma: { instanceSetting: { findUnique: async () => mocks.row } } }));
vi.mock("@/lib/oauthProviders", () => ({ getOAuthSettings: async () => mocks.oauth }));
vi.mock("@/lib/oidc/providers", () => ({ listEnabledOidcProviders: async () => mocks.oidc }));
vi.mock("@/lib/saml/providers", () => ({ listEnabledSamlProviders: async () => mocks.saml }));
vi.mock("@/lib/emailAvailability", () => ({ isEmailServiceConfigured: async () => mocks.email }));

const none = { password: true, google: false, apple: false, github: false, oidc: false, saml: false, supabase: false, firebase: false, passkey: false, phone: false };
const allOn = Object.fromEntries(Object.keys(DEFAULT_SWITCHES).map((method) => [method, true])) as typeof DEFAULT_SWITCHES;
const state = (statuses: ReturnType<typeof resolveLoginMethods>, method: LoginMethod) => statuses.find((entry) => entry.method === method)!.state;

describe("login method resolution", () => {
  it("needs the switch on AND the method configured", () => {
    const statuses = resolveLoginMethods({ switches: { ...allOn, apple: false }, configured: { ...none, google: true, apple: true }, envList: null });
    expect(state(statuses, "google")).toBe("available");
    expect(state(statuses, "apple")).toBe("switched_off");
    expect(state(statuses, "github")).toBe("not_configured");
    expect(state(statuses, "password")).toBe("available");
    expect(availableMethods(statuses)).toEqual(["password", "google"]);
  });
  it("is password only until the operator switches anything on (product rules section 15)", () => {
    expect(DEFAULT_SWITCHES).toEqual({ ...none });
    const statuses = resolveLoginMethods({ switches: DEFAULT_SWITCHES, configured: { ...none, google: true, oidc: true, saml: true }, envList: null });
    expect(availableMethods(statuses)).toEqual(["password"]);
    expect(state(statuses, "google")).toBe("switched_off");
  });
  it("makes OIDC and SAML available only when switched on AND a provider is enabled; passkey and phone stay unavailable", () => {
    const on = { ...DEFAULT_SWITCHES, oidc: true, saml: true, passkey: true, phone: true };
    expect(availableMethods(resolveLoginMethods({ switches: on, configured: { ...none }, envList: null }))).toEqual(["password"]);
    expect(availableMethods(resolveLoginMethods({ switches: on, configured: { ...none, oidc: true, saml: true }, envList: null }))).toEqual(["password", "oidc", "saml"]);
  });
  it("lets LOGIN_METHODS win over the switches, still requiring configuration", () => {
    const statuses = resolveLoginMethods({ switches: { ...allOn, google: false }, configured: { ...none, google: true, github: true }, envList: ["google", "supabase"] });
    expect(availableMethods(statuses)).toEqual(["google"]);
    expect(state(statuses, "supabase")).toBe("not_configured");
    expect(state(statuses, "password")).toBe("switched_off");
    expect(statuses.every((entry) => entry.setByServer)).toBe(true);
  });
  it("parses the env list, dropping unknown words, and treats blank as unset", () => {
    expect(parseLoginMethodList("Google, nonsense,password")).toEqual(["password", "google"]);
    expect(parseLoginMethodList("saml, oidc, passkey, phone")).toEqual(["oidc", "saml", "passkey", "phone"]);
    expect(loginMethodsFromEnv({ LOGIN_METHODS: "none" })).toEqual([]);
    expect(loginMethodsFromEnv({ LOGIN_METHODS: "  " })).toBeNull();
    expect(loginMethodsFromEnv({})).toBeNull();
  });
});

describe("loadLoginMethods", () => {
  beforeEach(async () => { (await import("@/lib/loginMethods")).invalidateLoginMethodsCache(); mocks.row = null; mocks.oauth = { google: null, github: null, apple: null }; mocks.oidc = []; mocks.saml = []; mocks.email = true; }, 30_000);
  afterEach(() => vi.unstubAllEnvs());

  it("defaults every switch but password off: configured methods stay hidden until switched on", async () => {
    const { availableLoginMethods } = await import("@/lib/loginMethods");
    mocks.oauth = { google: { clientId: "a", clientSecret: "b" }, github: null, apple: null };
    vi.stubEnv("AUTH_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("AUTH_SUPABASE_ANON_KEY", "anon");
    expect(await availableLoginMethods()).toEqual(["password"]);
    mocks.row = { ...none, googleSignIn: true, supabaseSignIn: true, passwordSignIn: true } as never;
    (await import("@/lib/loginMethods")).invalidateLoginMethodsCache();
    expect(await availableLoginMethods()).toEqual(["password", "google", "supabase"]);
  });
  it("lists enabled OIDC and SAML providers for the login page, and hides them when the method is off", async () => {
    const { loginPageMethods } = await import("@/lib/loginMethods");
    mocks.oidc = [{ id: "o1", slug: "work", name: "Work", issuer: "https://idp.example", clientId: "c", clientSecret: "s", scopes: "openid" }];
    mocks.saml = [{ id: "s1", slug: "campus", name: "Campus" }];
    expect((await loginPageMethods()).singleSignOn).toEqual([]);
    mocks.row = { passwordSignIn: true, oidcSignIn: true, samlSignIn: true } as never;
    (await import("@/lib/loginMethods")).invalidateLoginMethodsCache();
    const page = await loginPageMethods();
    expect(page.singleSignOn).toEqual([{ kind: "oidc", id: "o1", slug: "work", name: "Work" }, { kind: "saml", id: "s1", slug: "campus", name: "Campus" }]);
    expect(JSON.stringify(page)).not.toContain("clientSecret");
  });
  it("reports whether an email service exists, so the login page can hide Forgot password", async () => {
    const { loginPageMethods } = await import("@/lib/loginMethods");
    expect((await loginPageMethods()).emailAvailable).toBe(true);
    mocks.email = false;
    expect((await loginPageMethods()).emailAvailable).toBe(false);
  });
  it("honours a database switch and the env override", async () => {
    const { availableLoginMethods, loginPageMethods } = await import("@/lib/loginMethods");
    mocks.oauth = { google: { clientId: "a", clientSecret: "b" }, github: { clientId: "a", clientSecret: "b" }, apple: null };
    mocks.row = { passwordSignIn: false, googleSignIn: true, appleSignIn: true, githubSignIn: false, supabaseSignIn: true, firebaseSignIn: true } as never;
    expect(await availableLoginMethods()).toEqual(["google"]);
    expect(await loginPageMethods()).toMatchObject({ passwordEnabled: false, providers: ["google"], singleSignOn: [] });
    vi.stubEnv("LOGIN_METHODS", "password,github");
    expect(await availableLoginMethods()).toEqual(["password", "github"]);
  });
});

describe("bridge configuration", () => {
  it("accepts only well-formed public values", () => {
    expect(supabaseConfig({ AUTH_SUPABASE_URL: "https://abc.supabase.co", AUTH_SUPABASE_ANON_KEY: "k" })).toMatchObject({ url: "https://abc.supabase.co", providers: ["email"] });
    expect(supabaseConfig({ AUTH_SUPABASE_URL: "http://abc.supabase.co", AUTH_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(supabaseConfig({ AUTH_SUPABASE_URL: "https://abc.supabase.co/x", AUTH_SUPABASE_ANON_KEY: "k" })).toBeNull();
    expect(firebaseConfig({ AUTH_FIREBASE_API_KEY: "AIzaSyExampleKey123", AUTH_FIREBASE_AUTH_DOMAIN: "demo-project.firebaseapp.com", AUTH_FIREBASE_PROJECT_ID: "demo-project", AUTH_FIREBASE_PROVIDERS: "google.com,emailLink,bogus" }))
      .toMatchObject({ projectId: "demo-project", providers: ["google.com", "emailLink"] });
    expect(firebaseConfig({ AUTH_FIREBASE_API_KEY: "AIzaSyExampleKey123", AUTH_FIREBASE_AUTH_DOMAIN: "https://evil", AUTH_FIREBASE_PROJECT_ID: "demo-project" })).toBeNull();
  });
  it("leaves a bridge out of the CSP when LOGIN_METHODS excludes it", () => {
    const env = { AUTH_SUPABASE_URL: "https://abc.supabase.co", AUTH_SUPABASE_ANON_KEY: "k", LOGIN_METHODS: "password,google" };
    expect(bridgeCspHosts(env).connect).toEqual([]);
    expect(bridgeCspHosts({ ...env, LOGIN_METHODS: "supabase" }).connect).toEqual(["https://abc.supabase.co"]);
  });
});
