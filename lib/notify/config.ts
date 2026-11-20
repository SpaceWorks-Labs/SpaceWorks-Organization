import crypto from "node:crypto";
import { CHANNEL_SPECS, providerSpec, type ProviderSpec } from "./descriptors";
import type { ConfigurableChannel } from "@/lib/messages/kinds";

/** A channel's saved fields: plain values and secrets by key. Stored as one encrypted JSON value; never sent to the browser. */
export type StoredConfig = Record<string, string>;

/** Fields the server makes itself and never shows (a Telegram webhook secret). */
const GENERATED: Partial<Record<ConfigurableChannel, string[]>> = { TELEGRAM: ["webhookSecret"] };

const compile = (spec: { pattern?: string }) => (spec.pattern ? new RegExp(spec.pattern) : null);

/** The provider's fields with a draft applied. Secrets left blank keep their saved value, but never across a new account. */
export function applyDraft(channel: ConfigurableChannel, provider: ProviderSpec, saved: StoredConfig, draft: Record<string, unknown>): { config: StoredConfig; retype: string[] } {
  const config: StoredConfig = {};
  const retype: string[] = [];
  const identity = provider.fields.find((field) => ["accountSid", "phoneNumberId", "serverUrl", "applicationId"].includes(field.key))?.key;
  const identityChanged = Boolean(identity && saved[identity] && typeof draft[identity] === "string" && (draft[identity] as string).trim() !== saved[identity]);
  for (const field of provider.fields) {
    const typed = typeof draft[field.key] === "string" ? (draft[field.key] as string).trim() : "";
    if (typed) config[field.key] = typed;
    else if (field.secret && saved[field.key]) {
      // A secret belongs to the account it was saved for: a new account needs it typed again.
      if (identityChanged) retype.push(field.key); else config[field.key] = saved[field.key];
    } else if (!field.secret && !(field.key in draft) && saved[field.key]) config[field.key] = saved[field.key];
  }
  for (const key of GENERATED[channel] ?? []) config[key] = saved[key] ?? crypto.randomBytes(24).toString("base64url");
  return { config, retype };
}

/** What is wrong with a complete config, as a message per field; empty when it is fine. */
export function configProblems(provider: ProviderSpec, config: StoredConfig): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of provider.fields) {
    const value = config[field.key];
    if (!value) {
      if (!field.optional) problems[field.key] = `Add the ${field.label.toLowerCase()}.`;
      continue;
    }
    if (value.length > 600 || (compile(field) && !compile(field)!.test(value))) problems[field.key] = field.message ?? `Check the ${field.label.toLowerCase()}.`;
  }
  // Twilio SMS needs a number or a messaging service.
  if (provider.id === "twilio" && provider.fields.some((field) => field.key === "messagingServiceSid") && !config.from && !config.messagingServiceSid) problems.from = "Add a sending number or a messaging service SID.";
  return problems;
}

export const isReady = (channel: ConfigurableChannel, provider: string, config: StoredConfig) => {
  const spec = providerSpec(channel, provider);
  return Boolean(spec) && Object.keys(configProblems(spec!, config)).length === 0;
};

/** What the settings screen may show: plain fields and which secrets are saved, never a secret. */
export function describeConfig(channel: ConfigurableChannel, provider: string, config: StoredConfig) {
  const spec = providerSpec(channel, provider) ?? CHANNEL_SPECS[channel].providers[0];
  return {
    values: Object.fromEntries(spec.fields.filter((field) => !field.secret).map((field) => [field.key, config[field.key] ?? ""])),
    secretsSaved: spec.fields.filter((field) => field.secret && config[field.key]).map((field) => field.key),
  };
}

/** Which fields changed, by name only, for the audit record. */
export function changedFieldNames(before: StoredConfig, after: StoredConfig): string {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !(GENERATED.TELEGRAM ?? []).includes(key) && before[key] !== after[key]).sort().join(",");
}

export function parseStored(json: string | null | undefined): StoredConfig {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}
