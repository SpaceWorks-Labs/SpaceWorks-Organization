import { ChannelError } from "../errors";
import { request, statusFailure } from "./http";

const API = "https://api.telegram.org";

/** Telegram's Bot API. The bot token is part of the address, so it never appears in an error. */
export function telegramTransport(config: { botToken: string }, base = API) {
  const url = (method: string) => `${base}/bot${config.botToken}/${method}`;
  return {
    async send(to: string, text: string) {
      const { status, json } = await request(url("sendMessage"), { json: { chat_id: to, text: text.slice(0, 4096), disable_web_page_preview: true } });
      const id = (json?.result as { message_id?: unknown } | undefined)?.message_id;
      if (status === 200 && json?.ok === true && id !== undefined) return { providerRef: String(id) };
      throw statusFailure("Telegram", status);
    },
    /** The bot's username, proving the token works. */
    async me() {
      const { status, json } = await request(url("getMe"), { method: "GET" });
      const name = (json?.result as { username?: unknown } | undefined)?.username;
      if (status === 200 && typeof name === "string") return name;
      throw statusFailure("Telegram", status);
    },
    /** Point the bot at our webhook; Telegram then sends the secret in X-Telegram-Bot-Api-Secret-Token on every update. */
    async setWebhook(address: string, secret: string) {
      const { status, json } = await request(url("setWebhook"), { json: { url: address, secret_token: secret, allowed_updates: ["message"] } });
      if (status !== 200 || json?.ok !== true) throw new ChannelError("Telegram did not accept the webhook address. It must be public HTTPS.", false, status);
    },
  };
}
