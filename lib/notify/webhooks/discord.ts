import "server-only";

import { channelForScope } from "../store";
import { verifyDiscordSignature } from "../verify";
import { handleText, readBody, reply } from "./common";

type Interaction = { type?: number; data?: { name?: string; options?: Array<{ name?: string; value?: unknown }> }; member?: { user?: { id?: unknown } }; user?: { id?: unknown } };

const message = (content: string) => reply(200, { type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });

/**
 * A Discord interaction. Verified by the Ed25519 signature over the timestamp and body, with the application's public
 * key. A bot cannot read direct messages without a gateway connection, so members link with `/link code:<code>` and stop with `/stop`.
 */
export async function discordWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const resolved = await channelForScope(scopeOrgId, "DISCORD");
  if (!resolved) return reply(404);
  const body = await readBody(request);
  if (body === null) return reply(413);
  if (!verifyDiscordSignature(resolved.config.publicKey ?? "", request.headers.get("x-signature-timestamp"), body, request.headers.get("x-signature-ed25519"))) return reply(401, { error: "Not verified." });
  let interaction: Interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return reply(400);
  }
  if (interaction.type === 1) return reply(200, { type: 1 });
  const id = interaction.member?.user?.id ?? interaction.user?.id;
  if (interaction.type !== 2 || typeof id !== "string") return reply(200);
  const name = interaction.data?.name;
  const code = interaction.data?.options?.find((option) => option.name === "code")?.value;
  const text = name === "stop" ? "stop" : name === "link" && typeof code === "string" ? code.slice(0, 60) : "";
  const answer = text ? await handleText({ scopeOrgId, channel: "DISCORD", identity: id, text }) : null;
  return message(answer ?? "Use /link with the code from your account page, or /stop.");
}
