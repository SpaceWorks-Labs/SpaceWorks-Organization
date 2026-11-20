import type { SuppressionEntry } from "../suppression";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []);

/** Resend: `email.bounced` (permanent only: soft bounces retry on their own) and `email.complained`. */
export function resendEntries(body: Json): SuppressionEntry[] {
  const data = obj(body.data);
  if (body.type === "email.complained") return strings(data.to).map((address) => ({ address, reason: "COMPLAINT" as const }));
  if (body.type === "email.bounced" && String(obj(data.bounce).type ?? "").toLowerCase() === "permanent") return strings(data.to).map((address) => ({ address, reason: "BOUNCE" as const }));
  return [];
}

const POSTMARK_HARD = new Set(["HardBounce", "BadEmailAddress"]);

/** Postmark: a hard bounce or bad address, or a spam complaint. Transient and soft bounces are ignored. */
export function postmarkEntries(body: Json): SuppressionEntry[] {
  const address = typeof body.Email === "string" ? body.Email : typeof body.Recipient === "string" ? body.Recipient : "";
  if (!address) return [];
  if (body.RecordType === "SpamComplaint") return [{ address, reason: "COMPLAINT" }];
  if (body.RecordType === "Bounce" && POSTMARK_HARD.has(String(body.Type))) return [{ address, reason: "BOUNCE" }];
  return [];
}

/** SES through SNS: the Message is JSON with a permanent bounce or a complaint and the affected recipients. */
export function sesEntries(message: string): SuppressionEntry[] {
  let body: Json;
  try {
    body = obj(JSON.parse(message));
  } catch {
    return [];
  }
  const kind = String(body.notificationType ?? body.eventType ?? "");
  if (kind === "Bounce" && String(obj(body.bounce).bounceType) === "Permanent") {
    return (Array.isArray(obj(body.bounce).bouncedRecipients) ? (obj(body.bounce).bouncedRecipients as unknown[]) : []).flatMap((item) => strings(obj(item).emailAddress)).map((address) => ({ address, reason: "BOUNCE" as const }));
  }
  if (kind === "Complaint") {
    return (Array.isArray(obj(body.complaint).complainedRecipients) ? (obj(body.complaint).complainedRecipients as unknown[]) : []).flatMap((item) => strings(obj(item).emailAddress)).map((address) => ({ address, reason: "COMPLAINT" as const }));
  }
  return [];
}
