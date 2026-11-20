import { providerRequest, SmsProviderError, statusError, type SmsSender } from "./types";

export type TwilioFields = {
  accountSid: string;
  /** The account auth token, or an API key's secret together with `apiKeySid`. */
  secret: string;
  apiKeySid?: string;
  from?: string;
  messagingServiceSid?: string;
};

export const TWILIO_SID = /^AC[0-9a-f]{32}$/i;

/** Twilio's reasons a number can never be texted: invalid number, unsubscribed, blocked, not reachable by SMS. */
const NUMBER_REFUSED = new Set([21211, 21214, 21217, 21408, 21610, 21612, 21614]);

/**
 * Twilio's Messages API. The outbox id goes as an idempotency token, so a retry after acceptance does not send
 * twice, and the delivery report address rides on each message (verified by X-Twilio-Signature when it arrives).
 */
export function twilioSender(fields: TwilioFields): SmsSender {
  const user = fields.apiKeySid || fields.accountSid;
  const authorization = `Basic ${Buffer.from(`${user}:${fields.secret}`).toString("base64")}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(fields.accountSid)}/Messages.json`;
  return {
    async send(message) {
      const form = new URLSearchParams({ To: message.to, Body: message.text });
      if (fields.messagingServiceSid) form.set("MessagingServiceSid", fields.messagingServiceSid);
      else if (fields.from) form.set("From", fields.from);
      if (message.statusCallback) form.set("StatusCallback", message.statusCallback);
      const { status, json } = await providerRequest(url, {
        headers: { authorization, "content-type": "application/x-www-form-urlencoded", ...(message.key ? { "i-twilio-idempotency-token": message.key } : {}) },
        body: form.toString(),
      });
      const body = json as { sid?: unknown; code?: unknown } | null;
      if (status >= 200 && status < 300 && typeof body?.sid === "string") return { providerRef: body.sid };
      if (status === 400 && typeof body?.code === "number" && NUMBER_REFUSED.has(body.code)) throw new SmsProviderError("Twilio will not send to this number.", false, status);
      throw statusError("Twilio", status);
    },
  };
}
