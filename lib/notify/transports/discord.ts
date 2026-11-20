import { ChannelError } from "../errors";
import { request, statusFailure } from "./http";

const API = "https://discord.com/api/v10";

export function discordTransport(config: { botToken: string }, base = API) {
  const headers = { authorization: `Bot ${config.botToken}` };
  return {
    /** A direct message: open (or find) the bot's channel with the user, then post in it. */
    async send(to: string, text: string) {
      const dm = await request(`${base}/users/@me/channels`, { headers, json: { recipient_id: to } });
      const channelId = dm.json?.id;
      if (dm.status !== 200 || typeof channelId !== "string") throw statusFailure("Discord", dm.status);
      const { status, json } = await request(`${base}/channels/${encodeURIComponent(channelId)}/messages`, { headers, json: { content: text.slice(0, 2000), allowed_mentions: { parse: [] } } });
      if (status >= 200 && status < 300 && typeof json?.id === "string") return { providerRef: json.id };
      // 403 here usually means the member closed direct messages from this server's apps.
      throw statusFailure("Discord", status);
    },
    async verify() {
      const { status } = await request(`${base}/users/@me`, { method: "GET", headers });
      if (status !== 200) throw new ChannelError("Discord refused the bot token.", false, status);
    },
  };
}
