/** A consent grant follows the exact scope and public configuration; any change to either needs a new grant. */
export async function consentScope(scopeId: string, policy: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(policy)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${scopeId}:${hex}`;
}
