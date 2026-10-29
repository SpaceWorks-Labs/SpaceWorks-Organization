import "server-only";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { decodeWire, encodeWire } from "./codec";
import { backendHeaders, backendUrl } from "./request";

/** Root layout children and caller-supplied permission claims never cross the API. */
export async function viewArguments(args: unknown[]) {
  return Promise.all(args.map(async (value) => {
    const root = await value;
    if (!root || typeof root !== "object" || Array.isArray(root)) return root;
    const input = root as Record<string, unknown>;
    if (input.ctx && typeof input.ctx === "object") {
      const ctx = input.ctx as { organisation?: { slug?: string; }; event?: { id?: string; }; };
      return { ctx: { organisation: { slug: ctx.organisation?.slug }, event: { id: ctx.event?.id } } };
    }
    return Object.fromEntries(Object.entries(input).filter(([key]) => key !== "children"));
  }));
}

type Envelope = {
  ok: boolean;
  value?: unknown;
  navigation?: { type: "redirect" | "not-found"; location?: string; };
  invalidations?: Array<{ path: string; type?: "page" | "layout"; }>;
};

async function applyResponseCookies(response: Response) {
  const rawCookies = response.headers.getSetCookie();
  if (!rawCookies.length) return;
  const jar = await cookies();
  for (const raw of rawCookies) {
    const [pair, ...attributes] = raw.split(";");
    const equals = pair.indexOf("=");
    if (equals < 1) throw new Error("Invalid backend cookie.");
    const options: { path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none"; expires?: Date; maxAge?: number; } = {};
    for (const attribute of attributes) {
      const [name, ...values] = attribute.trim().split("=");
      const value = values.join("=");
      switch (name.toLowerCase()) {
        case "path": options.path = value; break;
        case "httponly": options.httpOnly = true; break;
        case "secure": options.secure = true; break;
        case "samesite": if (["lax", "strict", "none"].includes(value.toLowerCase())) options.sameSite = value.toLowerCase() as "lax" | "strict" | "none"; break;
        case "expires": options.expires = new Date(value); break;
        case "max-age": options.maxAge = Number(value); break;
        // Cookies are host-only on the frontend; backend domains are never copied.
      }
    }
    jar.set(pair.slice(0, equals), pair.slice(equals + 1), options);
  }
}

export async function invokeBackend<T>(kind: "view" | "action", id: string, args: unknown[]): Promise<T> {
  const input = kind === "view" ? await viewArguments(args) : args;
  const requestHeaders = await backendHeaders();
  requestHeaders.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(backendUrl(`/api/frontend/${kind}/${encodeURIComponent(id)}`), {
      method: "POST", headers: requestHeaders, body: JSON.stringify(await encodeWire(input)),
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error("The server could not be reached. Try again shortly.");
  }
  if (!response.ok) throw new Error("The request could not be completed. Try again shortly.");
  const payload = await response.json() as Envelope;
  if (kind === "action") {
    await applyResponseCookies(response);
    for (const item of payload.invalidations ?? []) revalidatePath(item.path, item.type);
  }
  if (payload.navigation?.type === "not-found") notFound();
  if (payload.navigation?.type === "redirect" && payload.navigation.location) redirect(payload.navigation.location);
  if (!payload.ok) throw new Error("The request could not be completed. Try again shortly.");
  // Backend readers have their own row caps; allow larger bounded view DTOs
  // (for example bulk card rosters) than untrusted action inputs.
  return decodeWire(payload.value, 0, { entries: 200_000 }) as T;
}
