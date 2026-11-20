import { CredentialsSignin } from "next-auth";

/**
 * A sign-in refusal whose `code` reaches the login page through Auth.js. Every method module throws these, so the
 * login screen maps one set of codes (loginErrorMessage in components/auth/MfaStep.tsx).
 */
export class SignInError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

/** The method is switched off (or its provider is): "off means gone". */
export const methodDisabled = () => new SignInError("method_disabled");

/** Too many failed attempts for this account: wait before trying again. The same answer for unknown accounts. */
export const throttled = () => new SignInError("throttled");
