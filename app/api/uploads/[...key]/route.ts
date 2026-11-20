import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { downloadFile, isPublicDerivativeKey } from "@/lib/storage";
import { safeDownloadName } from "@/lib/storage/pageFiles";
import { isPageFileKey } from "@/lib/publicPage/links";

type Context = { params: Promise<{ key: string[] }> };

// Member photos are personal data: browsers may keep one briefly but shared caches (CDNs) never, so a copy cannot outlive an erasure.
const MEMBER_PHOTO_KEY = /^organisations\/[^/]+\/(?:members|member-id-photos)\//;

const missingHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { key } = await params;
    const dbKey = key.join("/");
    if (!isPublicDerivativeKey(dbKey)) {
      return new NextResponse("Not Found", { status: 404, headers: missingHeaders });
    }

    const asset = await downloadFile(dbKey);
    if (!asset) {
      return new NextResponse("Not Found", { status: 404, headers: missingHeaders });
    }

    // An organisation's PDF is only ever a download: an attachment with a safe name, never rendered by the browser.
    if (isPageFileKey(dbKey)) {
      return new Response(Uint8Array.from(asset.body).buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeDownloadName(request.nextUrl.searchParams.get("name"))}"`,
          "Content-Security-Policy": "sandbox",
          "Cross-Origin-Resource-Policy": "same-site",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new Response(Uint8Array.from(asset.body).buffer, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-site",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": MEMBER_PHOTO_KEY.test(dbKey) ? "private, no-store" : "public, max-age=31536000, immutable",
      },
    });
  } catch {
    console.error("[uploads API] Failed to fetch public derivative.");
    return new NextResponse("Internal Server Error", { status: 500, headers: missingHeaders });
  }
}
