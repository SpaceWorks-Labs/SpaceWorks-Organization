import crypto from "crypto";

/** Names the browser that started a SAML sign-in: an httpOnly Lax cookie whose hash rides on the AuthnRequest and the ticket. */
export const SAML_FLOW_COOKIE = "swo.saml-flow";
export const SAML_FLOW_TTL_SECONDS = 10 * 60;

export const newFlowToken = () => crypto.randomBytes(32).toString("base64url");
export const flowHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** The flow token from a Cookie header, or null when this browser did not start the flow. */
export function readFlowToken(cookieHeader: string | null | undefined) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SAML_FLOW_COOKIE) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

export const flowCookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/api/auth", maxAge: SAML_FLOW_TTL_SECONDS };
