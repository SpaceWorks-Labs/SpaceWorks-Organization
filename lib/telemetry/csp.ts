import { allowedTelemetryOrigins, isBareHttpsOrigin, mixpanelFromEnv } from "./env";
import { templateForPath } from "./routes";
import { bridgeCspHosts } from "@/lib/authBridges";

type Env = Record<string, string | undefined>;

const RAZORPAY_FRAMES = ["https://api.razorpay.com", "https://checkout.razorpay.com"];
// Checkout reads its options from api.razorpay.com and reports from lumberjack; the script and frame come from the others.
const RAZORPAY_CONNECT = [...RAZORPAY_FRAMES, "https://lumberjack.razorpay.com"];

/** The pages that may open the Razorpay Checkout frame: the member account area and the signed pay link. */
export const needsRazorpay = (pathname: string) => pathname.startsWith("/account") || pathname.startsWith("/pay/");

/** The pages that run a Supabase or Firebase sign-in: sign-in and its bridges, staff invites and email verification. */
export const needsAuthBridge = (pathname: string) =>
  pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/join/org/") || pathname === "/verify-email" || pathname.startsWith("/verify-email/");

/** The backend origin when this build talks to it from the browser; plain http only for the CI test backend. */
function backendOrigin(env: Env): string | null {
  const value = env.NEXT_PUBLIC_BACKEND_ORIGIN ?? "";
  if (isBareHttpsOrigin(value)) return value;
  return env.CI === "true" && env.ALLOW_INSECURE_PRODUCTION_TESTS === "1" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value) ? value : null;
}

/**
 * Origins this page's CSP may add. Everything comes from the environment: the proxies never read the database.
 * `script` hosts are inert while 'strict-dynamic' is present (the real limits are the consent gate and connect-src),
 * and are listed for browsers that ignore it.
 */
export function cspHosts(pathname: string, env: Env = process.env) {
  const connect: string[] = [];
  const script: string[] = [];
  const frame: string[] = needsRazorpay(pathname) ? RAZORPAY_FRAMES : [];
  const backend = backendOrigin(env);
  if (backend) connect.push(backend);
  if (needsRazorpay(pathname)) connect.push(...RAZORPAY_CONNECT);
  // Identity bridges widen the policy on sign-in pages only.
  if (needsAuthBridge(pathname)) {
    const bridge = bridgeCspHosts(env);
    connect.push(...bridge.connect);
    frame.push(...bridge.frame);
    script.push(...bridge.script);
  }
  // Outside providers can only ever run on the public templates; everywhere else the policy never widens.
  if (templateForPath(pathname)) {
    const allowed = allowedTelemetryOrigins(env);
    connect.push(...allowed);
    script.push(...allowed);
    const mixpanel = mixpanelFromEnv(env);
    if (mixpanel) { connect.push(mixpanel.apiHost); script.push(mixpanel.sdkHost); }
  }
  return { connect: [...new Set(connect)], script: [...new Set(script)], frame: [...new Set(frame)] };
}
