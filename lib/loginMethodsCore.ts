/**
 * The sign-in methods, in the order they are shown (product rules §15). Pure, so the login page, the proxies and
 * tests share it. Password is on by default; every other method is off until the operator switches it on.
 */
export const LOGIN_METHODS = ["password", "google", "apple", "github", "oidc", "saml", "supabase", "firebase", "passkey", "phone"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** Accepted names whose method module is not installed yet: they resolve to "not_configured" and the settings screen hides them. */
export const PENDING_LOGIN_METHODS: readonly LoginMethod[] = [];

export const LOGIN_METHOD_LABELS: Record<LoginMethod, string> = {
  password: "Email and password",
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  oidc: "OpenID Connect",
  saml: "SAML 2.0",
  supabase: "Supabase",
  firebase: "Firebase",
  passkey: "Passkeys",
  phone: "Phone code",
};

/** The InstanceSetting column behind each method's switch. */
export const LOGIN_SWITCH_FIELDS = {
  password: "passwordSignIn",
  google: "googleSignIn",
  apple: "appleSignIn",
  github: "githubSignIn",
  oidc: "oidcSignIn",
  saml: "samlSignIn",
  supabase: "supabaseSignIn",
  firebase: "firebaseSignIn",
  passkey: "passkeySignIn",
  phone: "phoneSignIn",
} as const satisfies Record<LoginMethod, string>;

export type LoginSwitches = Record<LoginMethod, boolean>;

/** Before the operator changes anything: password only. */
export const DEFAULT_SWITCHES: LoginSwitches = {
  password: true, google: false, apple: false, github: false, oidc: false, saml: false, supabase: false, firebase: false, passkey: false, phone: false,
};

/** Parse a comma list of method ids; unknown words are dropped. `none` and an empty list mean no method. */
export function parseLoginMethodList(value: string): LoginMethod[] {
  const words = value.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  return LOGIN_METHODS.filter((method) => words.includes(method));
}

/** The deployment's own choice from install (LOGIN_METHODS), or null when it is unset or blank. */
export function loginMethodsFromEnv(env: Record<string, string | undefined> = process.env): LoginMethod[] | null {
  const value = env.LOGIN_METHODS?.trim();
  return value ? parseLoginMethodList(value) : null;
}

export type MethodState = "available" | "switched_off" | "not_configured";

export type MethodStatus = {
  method: LoginMethod;
  state: MethodState;
  /** Whether the server's LOGIN_METHODS is what decided the switch. */
  setByServer: boolean;
};

/**
 * Whether each method can be used: its switch is on AND it is configured. With LOGIN_METHODS set, the list is the
 * switch for every method and the database is ignored. Password sign-in needs no configuration. For OIDC and SAML,
 * "configured" means at least one enabled provider; each provider's own enabled flag is the provider switch.
 */
export function resolveLoginMethods(input: { switches: LoginSwitches; configured: Record<LoginMethod, boolean>; envList: LoginMethod[] | null }): MethodStatus[] {
  return LOGIN_METHODS.map((method) => {
    const on = input.envList ? input.envList.includes(method) : input.switches[method];
    const configured = method === "password" ? true : input.configured[method];
    const state: MethodState = !on ? "switched_off" : configured ? "available" : "not_configured";
    return { method, state, setByServer: input.envList !== null };
  });
}

export const availableMethods = (statuses: MethodStatus[]) => statuses.filter((status) => status.state === "available").map((status) => status.method);
