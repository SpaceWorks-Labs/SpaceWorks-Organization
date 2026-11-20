import "server-only";

import nodemailer from "nodemailer";
import { getEmailSettings } from "@/lib/instanceSettings";
import { providerMailer, providerReady } from "./providerConfig";
import type { Mailer } from "./providers/types";
import { withSuppression } from "./suppression";

const SMTP_CONNECTION_TIMEOUT_MS = 30_000;
const SMTP_GREETING_TIMEOUT_MS = 30_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;

export class EmailTransportUnavailableError extends Error {
  override name = "EmailTransportUnavailableError";

  constructor() {
    super("Transactional email transport is not configured.");
  }
}

export class EmailRecipientRejectedError extends Error {
  override name = "EmailRecipientRejectedError";

  constructor() {
    super("The email provider rejected the recipient.");
  }
}

export function assertEmailAccepted(result: { accepted?: unknown; rejected?: unknown }) {
  if (
    (Array.isArray(result.rejected) && result.rejected.length > 0) ||
    (Array.isArray(result.accepted) && result.accepted.length === 0)
  ) {
    throw new EmailRecipientRejectedError();
  }
}

type EmailSettings = Awaited<ReturnType<typeof getEmailSettings>>;

/** The transport for a set of platform email settings, or null when email is not set up (nothing is sent). */
export function buildPlatformMailer(settings: EmailSettings): Mailer | null {
  const provider = settings.provider ?? "smtp";
  if (provider !== "smtp") {
    const config = settings.providerConfig ?? {};
    if (!providerReady(provider, config)) return null;
    return withSuppression(providerMailer(provider, config), null);
  }
  const tls = process.env.NODE_ENV === "production" ? { minVersion: "TLSv1.2" as const, rejectUnauthorized: true } : undefined;
  const requireTLS = process.env.NODE_ENV === "production" && !settings.secure;
  const common = {
    auth: settings.user && settings.password ? { user: settings.user, pass: settings.password } : undefined,
    disableFileAccess: true, disableUrlAccess: true, requireTLS, tls,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  };
  if (settings.service) return withSuppression(nodemailer.createTransport({ service: settings.service, ...common }), null);
  if (!settings.host) return null;
  return withSuppression(nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, ...common }), null);
}

export async function getEmailTransport(): Promise<{ from: string; transporter: Mailer | null }> {
  const settings = await getEmailSettings();
  const transporter = buildPlatformMailer(settings);
  if (!transporter && process.env.NODE_ENV === "production") throw new EmailTransportUnavailableError();
  return { from: settings.from, transporter };
}
