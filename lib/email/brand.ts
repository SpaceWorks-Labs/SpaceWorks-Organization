/**
 * Space Works Organization brand for transactional email. Email clients get the
 * hosted PNG lockup (never inline SVG), from the public base URL, with fixed
 * dimensions and alt text so it degrades to "Space Works" when images are
 * blocked. Colours are the Space Works palette: Deep Ink text, Maker Teal
 * actions with cream labels, Warm Cream grounds. Workshop Orange is never text.
 */
export const EMAIL_COLORS = {
  ink: "#142C2A",
  /** Deep Ink mixed toward white; 6.9:1 on white. */
  inkMuted: "#4A5D5B",
  teal: "#006E63",
  cream: "#FFF4E8",
  panel: "#FFFFFF",
  /** Hairlines: Warm Cream deepened toward Deep Ink. */
  line: "#E6DCCF",
} as const;

const EMAIL_FONT = "Gilroy, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Inline style for a primary email button: teal fill, cream label, pill shape (as in the app). */
export const EMAIL_BUTTON_STYLE = `background-color: ${EMAIL_COLORS.teal}; color: ${EMAIL_COLORS.cream}; padding: 14px 28px; border-radius: 9999px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;`;

function baseUrl(): string | null {
  return process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || null;
}

/**
 * Full-colour horizontal lockup on Warm Cream, 180px wide (the brand minimum), with clear space on
 * every side. Without a public address the hosted image cannot load, so the
 * header falls back to the "Space Works" wordmark text instead of a localhost link.
 */
function emailBrandHeader(): string {
  const base = baseUrl();
  const mark = base
    ? `<img src="${base}/brand/logo/lockup-horizontal.png" width="180" height="29" alt="Space Works" style="display: inline-block; width: 180px; height: 29px; border: 0; outline: none; text-decoration: none;">`
    : `<span style="font-size: 22px; font-weight: 700; color: ${EMAIL_COLORS.ink};">Space Works</span>`;
  return `<div style="background-color: ${EMAIL_COLORS.cream}; padding: 24px; text-align: center; border-bottom: 1px solid ${EMAIL_COLORS.line};">${mark}</div>`;
}

function emailBrandFooter(): string {
  return `<div style="background-color: ${EMAIL_COLORS.cream}; padding: 16px; text-align: center; font-size: 12px; line-height: 1.6; color: ${EMAIL_COLORS.inkMuted}; border-top: 1px solid ${EMAIL_COLORS.line};">
            This email was sent by Space Works Organization.<br>
            &copy; ${new Date().getFullYear()} Space Works
          </div>`;
}

/** The outer page and card every transactional email shares. */
export function emailLayout(title: string, inner: string): string {
  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
      </head>
      <body style="font-family: ${EMAIL_FONT}; background-color: ${EMAIL_COLORS.cream}; margin: 0; padding: 20px; color: ${EMAIL_COLORS.ink};">
        <div style="max-width: 600px; margin: 40px auto; background-color: ${EMAIL_COLORS.panel}; border-radius: 16px; border: 1px solid ${EMAIL_COLORS.line}; overflow: hidden;">
          ${emailBrandHeader()}
          <div style="padding: 32px;">${inner}</div>
          ${emailBrandFooter()}
        </div>
      </body>
    </html>`;
}
