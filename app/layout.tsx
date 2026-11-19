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
import { COLOR_MODE_BOOT_SCRIPT, COLOR_MODE_COOKIE, THEME_COLOR, resolveColorMode, serverPaintedColorMode } from "@/lib/colorMode";

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

/** Browser chrome follows the painted theme: Warm Cream, or black for a saved Dark (the boot script handles System). */
export async function generateViewport(): Promise<Viewport> {
  const mode = resolveColorMode((await cookies()).get(COLOR_MODE_COOKIE)?.value);
  return { themeColor: THEME_COLOR[serverPaintedColorMode(mode) ?? "light"] };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // proxy.ts injects a per-request CSP nonce (lib/pageSecurity.ts, the x-nonce request header); waiting for the
  // request lets Next.js attach it to every framework script.
  await connection();
  const mode = resolveColorMode((await cookies()).get(COLOR_MODE_COOKIE)?.value);
  const painted = serverPaintedColorMode(mode);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Outside analytics (product rules §8.2): public config for signed-out visitors only, else null.
  const telemetry = await loadWebTelemetryView();

  return (
    <html lang="en-GB" className={painted === "dark" ? "dark" : undefined} style={painted ? { colorScheme: painted } : undefined} suppressHydrationWarning>
      <head>
        {/* Pre-paint: applies a System choice (and re-checks the cookie) before anything is drawn. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Providers initialColorMode={mode}>
          <ChromeSwitch>{children}</ChromeSwitch>
          <WebTelemetry view={telemetry} />
          <VisitBeacon />
          <RouteAnnouncer />
        </Providers>
      </body>
    </html>
  );
}
