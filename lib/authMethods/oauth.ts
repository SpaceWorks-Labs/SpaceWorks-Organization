import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Apple from "next-auth/providers/apple";
import type { AuthMethodModule } from "./types";

/**
 * Google, GitHub and Apple: the operator-level providers that may link to an existing account by a verified email.
 * That is safe only because callbacks.signIn refuses any identity whose provider has not verified the email.
 * A provider that is off is not registered; the route gate (lib/authMethods/gate.ts) answers its URLs with
 * `method_disabled`.
 */
export const oauthMethod: AuthMethodModule = ({ oauth, available }) => {
  // Apple answers with a cross-site POST (response_mode=form_post): the state, nonce and callback cookies must ride it.
  const crossSite = oauth.apple && available.includes("apple") && process.env.NODE_ENV === "production" && process.env.ALLOW_PLAIN_HTTP !== "1"
    ? { options: { sameSite: "none" as const, secure: true } } : undefined;
  return {
    providers: [
      ...(oauth.google && available.includes("google") ? [Google({ ...oauth.google, allowDangerousEmailAccountLinking: true })] : []),
      ...(oauth.github && available.includes("github") ? [GitHub({ ...oauth.github, authorization: { params: { scope: "read:user user:email" } }, allowDangerousEmailAccountLinking: true })] : []),
      ...(oauth.apple && available.includes("apple") ? [Apple({ ...oauth.apple, allowDangerousEmailAccountLinking: true })] : []),
    ],
    cookies: crossSite ? { state: crossSite, nonce: crossSite, pkceCodeVerifier: crossSite, callbackUrl: crossSite } : undefined,
  };
};
