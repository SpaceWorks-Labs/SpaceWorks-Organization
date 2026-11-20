import { bearer, request, statusFailure } from "./http";

/** A business-initiated message: an approved template, filled with the ordered variables. Plain text is never sent. */
export type TemplateSend = { to: string; template: string; language: string; variables: string[]; key?: string };

const digits = (e164: string) => e164.replace(/^\+/, "");
/** WhatsApp template variables may not hold line breaks, tabs or long runs of spaces. */
export const whatsappVariable = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 1000);

/** Twilio's WhatsApp sender: a Content API template (its SID in `template`), variables numbered from 1. */
export function twilioWhatsApp(config: { accountSid: string; authToken: string; from: string }, base = "https://api.twilio.com") {
  const authorization = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  const account = `${base}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}`;
  return {
    async send(message: TemplateSend) {
      const variables = Object.fromEntries(message.variables.map((value, index) => [String(index + 1), whatsappVariable(value)]));
      const form = new URLSearchParams({ To: `whatsapp:${message.to}`, From: `whatsapp:${config.from}`, ContentSid: message.template, ContentVariables: JSON.stringify(variables) });
      const { status, json } = await request(`${account}/Messages.json`, {
        headers: { authorization, "content-type": "application/x-www-form-urlencoded", ...(message.key ? { "i-twilio-idempotency-token": message.key } : {}) },
        body: form.toString(),
      });
      if (status >= 200 && status < 300 && typeof json?.sid === "string") return { providerRef: json.sid };
      throw statusFailure("Twilio", status);
    },
    async verify() {
      const { status } = await request(`${account}.json`, { method: "GET", headers: { authorization } });
      if (status !== 200) throw statusFailure("Twilio", status);
    },
  };
}

/** Meta's WhatsApp Cloud API: a template by name and language, with the variables as body parameters. */
export function metaWhatsApp(config: { phoneNumberId: string; accessToken: string }, base = "https://graph.facebook.com/v21.0") {
  const headers = bearer(config.accessToken);
  return {
    async send(message: TemplateSend) {
      const parameters = message.variables.map((value) => ({ type: "text", text: whatsappVariable(value) }));
      const { status, json } = await request(`${base}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
        headers,
        json: { messaging_product: "whatsapp", to: digits(message.to), type: "template", template: { name: message.template, language: { code: message.language }, ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}) } },
      });
      const id = (json?.messages as Array<{ id?: unknown }> | undefined)?.[0]?.id;
      if (status >= 200 && status < 300 && typeof id === "string") return { providerRef: id };
      throw statusFailure("WhatsApp", status);
    },
    async verify() {
      const { status } = await request(`${base}/${encodeURIComponent(config.phoneNumberId)}?fields=display_phone_number`, { method: "GET", headers });
      if (status !== 200) throw statusFailure("WhatsApp", status);
    },
  };
}
