import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isIP } from "node:net";
import { pageSecurity } from "@/lib/pageSecurity";
import { CLIENT_IP_HEADER, GATEWAY_HEADER, isFrontendPeer } from "@/lib/frontend/peer";
import { checkRateLimit } from "@/lib/rateLimit";

function tooMany() {
  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
  );
}

function tooManyText() {
  return new NextResponse("Too many requests. Try again later.", {
    status: 429,
    headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The peer credential authenticates only the frontend service, never a user.
  // Only an authenticated peer may supply the original browser address.
  if (request.headers.has(GATEWAY_HEADER)) {
    if (!isFrontendPeer(request.headers)) return new NextResponse("Not found", { status: 404 });
    const ip = request.headers.get(CLIENT_IP_HEADER)?.trim();
    const header = process.env.TRUSTED_PROXY_IP_HEADER;
    if (header && ["x-real-ip", "x-forwarded-for", "cf-connecting-ip"].includes(header)) request.headers.set(header, ip && isIP(ip) ? ip : "unknown");
  }
  if (process.env.DEPLOYMENT_MODE === "backend" && !pathname.startsWith("/api/") && !/\/(opengraph-image|twitter-image)(?:\/|$)/.test(pathname)) return new NextResponse("Not found", { status: 404 });

  // Server Actions post to page URLs, not /api. Apply one distributed ceiling
  // before any action-specific subject/IP limits run in the action itself.
  if (request.method === "POST" && request.headers.has("next-action")) {
    if (!(await checkRateLimit(request, "action"))) return tooMany();
  }

  // Public card checks (QR scans at a door or desk).
  if (pathname.startsWith("/verify/")) {
    if (!(await checkRateLimit(request, "verifyCard"))) return tooManyText();
  }

  // Payment gateway webhooks: one generous bucket of their own, never the per-IP global limit, so
  // gateway retries are not refused while money is being confirmed.
  if (pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/email/webhooks/") || pathname.startsWith("/api/sms/webhooks/") || pathname.startsWith("/api/messaging/webhooks/")) {
    if (!(await checkRateLimit(request, "webhook"))) return tooMany();
    return NextResponse.next();
  }

  // Liveness must not depend on Redis. Readiness remains protected because a
  // failed distributed limiter means the application is not fully ready.
  if (pathname.startsWith("/api") && pathname !== "/api/health") {
    if (!(await checkRateLimit(request, "global"))) return tooMany();
  }

  // Auth.js polls session, CSRF, and provider endpoints with GET requests.
  // Counting those reads against the strict sign-in bucket logs active users
  // out after a few tabs or routine session refreshes. Mutating auth requests
  // retain the dedicated protection; all reads remain under the global limit.
  if (pathname.startsWith("/api/auth") && request.method !== "GET") {
    if (!(await checkRateLimit(request, "auth"))) {
      return tooMany();
    }
  }

  if (pathname === "/api/uploads" && request.method !== "GET") {
    if (!(await checkRateLimit(request, "upload"))) {
      return tooMany();
    }
  }

  if (pathname.startsWith("/api")) {
    const response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }

  return pageSecurity(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
