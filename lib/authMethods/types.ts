import type { NextAuthConfig } from "next-auth";
import type { loadLoginMethods } from "@/lib/loginMethods";
import type { LoginMethod } from "@/lib/loginMethodsCore";

export type AuthProvider = NonNullable<NextAuthConfig["providers"]>[number];

/** What every method module sees: the resolved login methods for this request. */
export type AuthContext = Awaited<ReturnType<typeof loadLoginMethods>>;

/**
 * One sign-in method family. A module returns the Auth.js providers it contributes (none when it has nothing to
 * offer) and, if needed, cookie options. A new Credentials method is one new module plus one line in index.ts.
 */
export type AuthMethodModule = (context: AuthContext) => { providers: AuthProvider[]; cookies?: NonNullable<NextAuthConfig["cookies"]> };

/** Whether a method is switched off. Credentials-type providers stay registered and refuse with `method_disabled`. */
export const isSwitchedOff = (context: AuthContext, method: LoginMethod) =>
  context.statuses.find((status) => status.method === method)?.state === "switched_off";
