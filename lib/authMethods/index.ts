import "server-only";

import { passwordMethod } from "./password";
import { oauthMethod } from "./oauth";
import { oidcMethod } from "./oidc";
import { samlMethod } from "./saml";
import { bridgesMethod } from "./bridges";
import { passkeyMethod } from "./passkey";
import { phoneMethod } from "./phone";
import type { AuthContext, AuthMethodModule } from "./types";

/** One module per method family. A new method (passkeys, phone codes) is one new module and one line here. */
const METHOD_MODULES: AuthMethodModule[] = [oauthMethod, oidcMethod, passwordMethod, samlMethod, bridgesMethod, passkeyMethod, phoneMethod];

/** The Auth.js providers and cookie options for this request, built from every method module. */
export function buildAuthMethods(context: AuthContext) {
  const built = METHOD_MODULES.map((method) => method(context));
  return {
    providers: built.flatMap((entry) => entry.providers),
    cookies: Object.assign({}, ...built.map((entry) => entry.cookies ?? {})) as Record<string, unknown>,
  };
}
