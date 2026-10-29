import "server-only";
import { NextResponse } from "next/server";
import { backendHeaders, backendUrl } from "./request";
import { backendOrigin, frontendOrigin } from "./config";

const blocked = /^\/api\/(?:frontend(?:\/|$)|internal(?:\/|$)|health\/db(?:\/|$))/i;
const forwardedRequestHeaders = ["accept", "content-type", "authorization", "user-agent", "if-none-match", "range", "if-range", "x-auth-return-redirect"];
const forwardedResponseHeaders = ["content-type", "cache-control", "etag", "content-disposition", "content-range", "accept-ranges", "retry-after", "vary", "x-content-type-options", "referrer-policy", "x-accel-buffering"];

export async function proxyBackendApi(request: Request) {
  const url = new URL(request.url);
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { return new NextResponse("Not found", { status: 404 }); }
  if (!url.pathname.startsWith("/api/") || /%2f|%5c/i.test(url.pathname) || decodedPath.includes("\\") || decodedPath.includes("%") || blocked.test(decodedPath)) return new NextResponse("Not found", { status: 404 });
  const safe = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";
  const machine = url.pathname.startsWith("/api/v1/") && request.headers.get("authorization")?.startsWith("Bearer ");
  if (!safe && !machine && request.headers.get("origin") !== frontendOrigin()) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const outgoing = await backendHeaders(request.headers);
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  // The backend has a minute to answer; once it has, a streamed body (a bulk card download) may take longer.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 60_000);
  try {
    const init: RequestInit & { duplex?: "half"; } = {
      method: request.method, headers: outgoing, redirect: "manual", cache: "no-store",
      signal: deadline.signal,
      ...(!safe && request.body ? { body: request.body, duplex: "half" as const } : {}),
    };
    const upstream = await fetch(backendUrl(url.pathname + url.search), init).finally(() => clearTimeout(timer));
    const responseHeaders = new Headers({ "X-Frame-Options": "DENY" });
    for (const name of forwardedResponseHeaders) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const value of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", value);
    const location = upstream.headers.get("location");
    if (location) {
      const target = new URL(location, backendOrigin());
      responseHeaders.set("location", target.origin === backendOrigin() ? frontendOrigin() + target.pathname + target.search + target.hash : target.href);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    console.error("[frontend] Backend request failed");
    return NextResponse.json({ error: "The server could not be reached. Try again shortly." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
