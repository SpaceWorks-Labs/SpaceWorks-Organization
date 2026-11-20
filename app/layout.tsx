import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ChromeSwitch } from "@/components/chrome/ChromeSwitch";
import { WebTelemetry } from "@/components/telemetry/WebTelemetry";
import { VisitBeacon } from "@/components/telemetry/VisitBeacon";
import { RouteAnnouncer } from "@/components/motion/RouteAnnouncer";
import { loadWebTelemetryView } from "@/lib/views/app__layout";
import { sessionCookieName } from "@/lib/sessionCookie";
import { COLOR_MODE_BOOT_SCRIPT, COLOR_MODE_COOKIE, THEME_COLOR, resolveColorMode } from "@/lib/colorMode";

export const metadata: Metadata = {
  title: {
    default: "Space Works Organization",
    template: "%s · Space Works Organization",
  },
  description: "Run your organisation's teamMembers: plans, members, renewals, payments and ID cards.",
  applicationName: "Space Works Organization",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  icons: {
    icon: [
      { url: "/brand/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icons/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/icons/icon-180.png",
  },
  openGraph: {
    siteName: "Space Works Organization",
    images: [{ url: "/brand/icons/og-1200x630.png", width: 1200, height: 630, alt: "Space Works" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/icons/og-1200x630.png"] },
};

/** Browser chrome follows the saved theme: Warm Cream, or black for Dark. */
export async function generateViewport(): Promise<Viewport> {
  const mode = resolveColorMode((await cookies()).get(COLOR_MODE_COOKIE)?.value);
  return { themeColor: THEME_COLOR[mode] };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // proxy.ts injects a per-request CSP nonce (lib/pageSecurity.ts, the x-nonce request header); waiting for the
  // request lets Next.js attach it to every framework script.
  await connection();
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const mode = resolveColorMode(jar.get(COLOR_MODE_COOKIE)?.value);
  // No session cookie means signed out: tell the client provider so anonymous visitors never call /api/auth/session.
  const sessionCookie = sessionCookieName();
  const signedOut = !jar.getAll().some((cookie) => cookie.name.startsWith(sessionCookie));
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // Outside analytics (product rules §8.2): public config for signed-out visitors only, else null.
  // A signed-in visitor (session cookie present) never gets it, so skip the session and settings lookups for them.
  const telemetry = signedOut ? await loadWebTelemetryView() : null;

  return (
    <html lang="en-GB" className={mode === "dark" ? "dark" : undefined} style={{ colorScheme: mode }} suppressHydrationWarning>
      <head>
        <link rel="preload" href="/brand/fonts/Gilroy-ExtraBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/brand/fonts/Outfit-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Pre-paint: re-applies the saved choice (cookie, then the localStorage mirror) before anything is drawn. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Providers initialColorMode={mode} session={signedOut ? null : undefined}>
          <ChromeSwitch>{children}</ChromeSwitch>
          <WebTelemetry view={telemetry} />
          <VisitBeacon />
          <RouteAnnouncer />
        </Providers>
      </body>
    </html>
  );
}
