/** Words for what a browser reports when a passkey prompt does not finish. Returns null when the person simply closed it. */
export function passkeyBrowserMessage(error: unknown, action: "add" | "sign-in"): string | null {
  const name = error instanceof Error ? ((error as { code?: string }).code ?? error.name) : "";
  if (name === "AbortError" || name === "ERROR_CEREMONY_ABORTED") return null;
  if (name === "NotAllowedError" || name === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") return null;
  if (name === "InvalidStateError" || name === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "This device already has a passkey for your account.";
  if (name === "SecurityError") return "Passkeys can’t be used on this address. Use the site’s own web address.";
  return action === "add" ? "The passkey could not be added. Try again." : "The passkey could not be used. Try again, or use another option.";
}
