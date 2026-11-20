import "server-only";

import Credentials from "next-auth/providers/credentials";
import { authorizeBridge, type BridgeProvider } from "@/lib/bridgeSignIn";
import { methodDisabled } from "./errors";
import { isSwitchedOff, type AuthMethodModule } from "./types";

const NAMES: Record<BridgeProvider, string> = { supabase: "Supabase", firebase: "Firebase" };

/**
 * The Supabase and Firebase bridges: Credentials providers that take the provider's token. They stay registered so
 * a switched-off bridge refuses with `method_disabled`. They never link to an existing account by email.
 */
export const bridgesMethod: AuthMethodModule = (context) => ({
  providers: (Object.keys(NAMES) as BridgeProvider[]).map((provider) =>
    Credentials({
      id: provider,
      name: NAMES[provider],
      credentials: { token: { type: "text" } },
      authorize: async (raw, request) => {
        if (isSwitchedOff(context, provider)) throw methodDisabled();
        return authorizeBridge(provider, raw, request);
      },
    })),
});
