import { assertPublicHost } from "@/lib/net/publicHost";
import { ChannelError } from "../errors";
import { bearer, request, statusFailure } from "./http";

/** Hosts the operator trusts even though they resolve to private addresses (a Mattermost on the same network). */
export function operatorListedHosts(env: Record<string, string | undefined> = process.env) {
  return (env.MESSAGING_MATTERMOST_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

/** Refuse a server that is not public, unless the operator listed it. Checked when saving and when sending. */
export async function assertMattermostHost(serverUrl: string, env: Record<string, string | undefined> = process.env) {
  const host = new URL(serverUrl).hostname.toLowerCase();
  if (operatorListedHosts(env).includes(host)) return;
  await assertPublicHost(host);
}

export function mattermostTransport(config: { serverUrl: string; botToken: string }) {
  const api = `${config.serverUrl.replace(/\/$/, "")}/api/v4`;
  const headers = bearer(config.botToken);
  const guard = () => assertMattermostHost(config.serverUrl).catch(() => { throw new ChannelError("That Mattermost address is not a public server.", false); });
  const me = async () => {
    const { status, json } = await request(`${api}/users/me`, { method: "GET", headers });
    if (status === 200 && typeof json?.id === "string") return json.id;
    throw statusFailure("Mattermost", status);
  };
  return {
    /** A direct message from the bot account: open the channel between the bot and the user, then post in it. */
    async send(to: string, text: string) {
      await guard();
      const botId = await me();
      const channel = await request(`${api}/channels/direct`, { headers, json: [botId, to] });
      if (channel.status >= 300 || typeof channel.json?.id !== "string") throw statusFailure("Mattermost", channel.status);
      const { status, json } = await request(`${api}/posts`, { headers, json: { channel_id: channel.json.id, message: text } });
      if (status >= 200 && status < 300 && typeof json?.id === "string") return { providerRef: json.id };
      throw statusFailure("Mattermost", status);
    },
    async verify() {
      await guard();
      await me();
    },
  };
}
