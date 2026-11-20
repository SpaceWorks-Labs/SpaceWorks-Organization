import "server-only";

import { channelForScope } from "../store";
import { verifyMattermostToken } from "../verify";
import { handleText, readBody, reply } from "./common";

/**
 * A Mattermost slash command (`/link <code>` or `/link stop`). Verified by the command's token, which is in the form
 * body; the answer is shown only to the person who typed it.
 */
export async function mattermostWebhook(request: Request, scopeOrgId: string | null): Promise<Response> {
  const resolved = await channelForScope(scopeOrgId, "MATTERMOST");
  if (!resolved) return reply(404);
  const body = await readBody(request);
  if (body === null) return reply(413);
  const form = new URLSearchParams(body);
  if (!verifyMattermostToken(resolved.config.slashToken ?? "", form.get("token"))) return reply(401, { error: "Not verified." });
  const user = form.get("user_id") ?? "";
  if (!/^[a-z0-9]{26}$/.test(user)) return reply(200, { response_type: "ephemeral", text: "Send /link with the code from your account page." });
  const answer = await handleText({ scopeOrgId, channel: "MATTERMOST", identity: user, text: (form.get("text") ?? "").slice(0, 200) });
  return reply(200, { response_type: "ephemeral", text: answer ?? "Send /link with the code from your account page, or /link stop." });
}
