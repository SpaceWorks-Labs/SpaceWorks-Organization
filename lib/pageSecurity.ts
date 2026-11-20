import { NextResponse, type NextRequest } from "next/server";
import { cspHosts } from "@/lib/telemetry/csp";

export function pageSecurity(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const development = process.env.NODE_ENV === "development";
  const hosts = cspHosts(request.nextUrl.pathname);
  const list = (items: string[]) => items.map((item) => ` ${item}`).join("");
  const csp = [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'",
    "frame-ancestors 'none'",
    // Razorpay Checkout opens in its own frame on the member account pages and the signed pay link; organisation
    // public pages (/o/*) may open a YouTube (youtube-nocookie) or Vimeo player after a visitor presses play.
    `frame-src ${hosts.frame.length ? hosts.frame.join(" ") : "'none'"}`,
    "form-action 'self'",
    // Tenant logos and photos are https URLs, and fonts may come from a CDN: a known gap (docs/SECURITY.md).
    "img-src 'self' data: blob: https:", "font-src 'self' data: https:",
    // Requests go to this origin, the backend, Razorpay on its pages and, on public pages only, the operator's approved analytics origins.
    `connect-src 'self'${list(hosts.connect)}${development ? " ws: wss:" : ""}`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${list(hosts.script)}${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Upgrading only makes sense on an HTTPS install; the installer's plain-HTTP mode would break every asset.
    ...(process.env.NODE_ENV === "production" && process.env.ALLOW_PLAIN_HTTP !== "1" && !(process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("http:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const incoming = new Headers(request.headers);
  incoming.set("Content-Security-Policy", csp);
  incoming.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-transform");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
