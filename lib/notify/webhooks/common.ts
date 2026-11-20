import "server-only";

import type { ConfigurableChannel } from "@/lib/messages/kinds";
import { isStopWord, stopFromReply } from "../consent";
import { completeChallenge, parseCode, userForIdentity } from "../endpoints";

const MAX_BODY = 256 * 1024;

export const reply = (status: number, body: Record<string, unknown> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The raw body, or null when it is too large. Signatures cover these exact bytes, so nothing is parsed first. */
export async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return null;
  const body = await request.text();
  return body.length > MAX_BODY ? null : body;
}

/** `?scope=platform` or `?scope=<organisation id>`: whose connection this webhook belongs to. Undefined when it is neither. */
export function scopeOf(request: Request): string | null | undefined {
  const scope = new URL(request.url).searchParams.get("scope") ?? "platform";
  if (scope === "platform") return null;
  return /^[A-Za-z0-9_-]{10,40}$/.test(scope) ? scope : undefined;
}

/** The last word of a message: a code arrives alone, after `/start`, or after `/link`. */
export function codeFromText(text: string): string | undefined {
  const last = text.trim().split(/\s+/).pop() ?? "";
  return parseCode(last) ? last : undefined;
}

export const STOPPED_TEXT = "You will not get any more messages here. You can turn them back on from your account.";
export const LINKED_TEXT = "Linked. You will get messages from your organisations here. You can stop them at any time from your account, or by replying STOP.";
export const FAILED_TEXT = "That code did not work. Make a new one from your account page and send it here.";

/**
 * A person wrote to a bot: a STOP ends their consent at once; anything else carrying a one-time code links the sender's
 * address to the account that asked for the code. The answer never repeats what was written or the sender's address.
 */
export async function handleText(input: { scopeOrgId: string | null; channel: ConfigurableChannel; identity: string; text: string }): Promise<string | null> {
  if (isStopWord(input.text)) {
    const userId = await userForIdentity(input.scopeOrgId, input.channel, input.identity);
    if (userId) await stopFromReply(userId, input.scopeOrgId, input.channel);
    return STOPPED_TEXT;
  }
  const code = codeFromText(input.text);
  if (!code) return null;
  const result = await completeChallenge({ code, scopeOrgId: input.scopeOrgId, channel: input.channel, identity: input.identity });
  return result.ok ? LINKED_TEXT : FAILED_TEXT;
}
