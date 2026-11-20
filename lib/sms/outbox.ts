import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PermanentOutboxError } from "@/lib/outboxKinds";
import { smsProviderReady } from "./config";
import { SmsProviderError } from "./providers/types";
import { platformSmsSender } from "./settings";

type CodePayload = { codeId: string; to: string; code: string; expiresAt: string };

export const SMS_BRAND = "Space Works Organization";

const record = (value: Prisma.JsonValue) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

export function asSmsCodePayload(value: Prisma.JsonValue): CodePayload | null {
  const p = record(value);
  if (!p || typeof p.codeId !== "string" || !p.codeId || p.codeId.length > 64) return null;
  if (typeof p.to !== "string" || !/^\+[1-9]\d{6,14}$/.test(p.to) || typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) return null;
  if (typeof p.expiresAt !== "string" || Number.isNaN(Date.parse(p.expiresAt))) return null;
  return { codeId: p.codeId, to: p.to, code: p.code, expiresAt: p.expiresAt };
}

/** The whole message: the code and the product name, nothing else. */
export const smsText = (code: string) => `${code} is your ${SMS_BRAND} code.`;

/** Where a provider that takes a per-message address sends its delivery reports, or undefined when it cannot be verified. */
function statusCallback(provider: string, config: { twilioAuthToken?: string }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  return provider === "twilio" && config.twilioAuthToken && base ? `${base}/api/sms/webhooks/twilio` : undefined;
}

/**
 * Send one phone code through the platform's SMS provider, after the business transaction committed. Once the
 * provider accepted, its message id is stored on the code row and a later delivery of the same outbox row is a
 * no-op, so a crash between acceptance and cleanup never sends twice. A refusal is permanent; network errors, 429
 * and 5xx are retried while the code lasts.
 */
export async function deliverSmsCode(payload: CodePayload, messageId: string): Promise<"sent" | "dropped"> {
  const row = await prisma.smsCode.findUnique({ where: { id: payload.codeId }, select: { providerRef: true, consumedAt: true, expiresAt: true } });
  if (!row) return "dropped";
  if (row.providerRef) return "sent";
  if (row.consumedAt || row.expiresAt <= new Date() || new Date(payload.expiresAt) <= new Date()) return "dropped";
  const platform = await platformSmsSender();
  if (!platform || !smsProviderReady(platform.provider, platform.config)) {
    await prisma.smsCode.updateMany({ where: { id: payload.codeId }, data: { deliveryState: "failed", deliveryError: "not_set_up" } });
    throw new PermanentOutboxError();
  }
  try {
    const key = /^<?(swo-[A-Za-z0-9_-]{1,64})@/.exec(messageId)?.[1];
    const { providerRef } = await platform.sender.send({ to: payload.to, text: smsText(payload.code), code: payload.code, brand: SMS_BRAND, key, statusCallback: statusCallback(platform.provider, platform.config) });
    await prisma.smsCode.updateMany({ where: { id: payload.codeId, providerRef: null }, data: { providerRef, deliveryState: "sent" } }).catch(() => undefined);
    return "sent";
  } catch (error) {
    if (error instanceof SmsProviderError && !error.retryable) {
      await prisma.smsCode.updateMany({ where: { id: payload.codeId }, data: { deliveryState: "failed", deliveryError: String(error.status ?? "refused") } });
      throw new PermanentOutboxError();
    }
    throw error;
  }
}
