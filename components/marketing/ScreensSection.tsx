import Link from "next/link";
import { ThemedShot, type ScreenName } from "./ThemedShot";

/** Captured from the seeded demo (scripts/capture-screens.mjs); each one names the area it belongs to. */
const SCREENS: ReadonlyArray<{ name: ScreenName; area: string; title: string; alt: string }> = [
  { name: "payments", area: "payments", title: "Payments", alt: "The payments list: online and offline payments, their status and receipt numbers." },
  { name: "reports-and-analytics", area: "reports-and-analytics", title: "Reports", alt: "The reports overview: active members, renewals and money collected, with charts." },
  { name: "member-cards", area: "member-cards", title: "Member cards", alt: "A member card with its QR code, in the card designer." },
  { name: "public-page", area: "public-page", title: "Public page", alt: "An organisation's public page with its plans and a join button." },
  { name: "members", area: "units", title: "Members", alt: "The member register with status, plan, area and grouping filters, and each member's role and membership." },
  { name: "certificates", area: "certificates", title: "Certificates", alt: "Certificate designs and the certificates issued to members, each with its number and status." },
];

/** The product in the visitor's own theme: light captures in light, dark captures in dark. */
export function ScreensSection() {
  return (
    <section id="screens" aria-labelledby="screens-title" className="sw-land-section">
      <div className="sw-land-wrap">
        <div className="sw-land-split" data-reveal="">
          <h2 id="screens-title" className="sw-land-h2">Built for the people who keep the register.</h2>
          <p className="sw-land-lede">
            Staff work in a calm dashboard; members see their own memberships, receipts and cards. Every screen follows the
            light or dark choice in the header.
          </p>
        </div>
        <ul className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:mt-14">
          {SCREENS.map((screen) => (
            <li key={screen.name} data-reveal="">
              <figure className="grid gap-3">
                <ThemedShot name={screen.name} alt={screen.alt} crop />
                <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-title text-ink">{screen.title}</span>
                  <Link href={`/features#${screen.area}`} className="text-label font-semibold text-accent-text underline underline-offset-4">
                    About {screen.title.toLowerCase()}
                  </Link>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
