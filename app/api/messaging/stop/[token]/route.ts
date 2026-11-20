import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { readStopToken, setConsent } from "@/lib/notify/consent";
import { CHANNEL_LABELS } from "@/lib/messages/kinds";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, form?: string) =>
  new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<style>:root{color-scheme:light dark}body{font:300 1rem/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem}h1{font-weight:800;font-size:1.5rem}button{font:inherit;font-weight:700;padding:.6rem 1.4rem;border-radius:9999px;border:0;background:CanvasText;color:Canvas;cursor:pointer}</style></head>` +
      `<body><main><h1>${title}</h1><p>${body}</p>${form ?? ""}</main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

async function describe(token: string) {
  const parsed = readStopToken(token);
  if (!parsed) return null;
  const org = await prisma.organisation.findUnique({ where: { id: parsed.organisationId }, select: { name: true } });
  return org ? { ...parsed, organisation: org.name } : null;
}

/** The stop link in a message: a page with one button. A link opened by a preview bot changes nothing; the button does. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!(await checkRateLimit(request, "webhook"))) return new Response("Too many requests.", { status: 429 });
  const found = await describe((await params).token);
  if (!found) return page("This link does not work", "It may be incomplete. You can change how you are contacted from your account.");
  const form = `<form method="post"><button type="submit">Stop these messages</button></form>`;
  return page(`Stop ${escape(CHANNEL_LABELS[found.channel])} messages?`, `You will stop getting ${escape(CHANNEL_LABELS[found.channel])} messages from ${escape(found.organisation)}. You can turn them back on from your account.`, form);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!(await checkRateLimit(request, "webhook"))) return new Response("Too many requests.", { status: 429 });
  const found = await describe((await params).token);
  if (!found) return page("This link does not work", "It may be incomplete. You can change how you are contacted from your account.");
  await setConsent(found.organisationId, found.userId, found.channel, "STOPPED");
  return page("Stopped", `You will not get ${escape(CHANNEL_LABELS[found.channel])} messages from ${escape(found.organisation)}.`);
}
