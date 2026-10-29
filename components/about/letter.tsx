import { SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";

/** The team's note on the About page (components/about/BuildingNote.tsx). */
export const LETTER = {
  overline: "A note from Space Works",
  title: "Members first. Paperwork last.",
  intro: [
    "Space Works started as a room with workbenches and a kettle. The people who kept it going were volunteers: a secretary with a spreadsheet, a treasurer with a folder of UPI screenshots, and a committee that met once a month to work out who had paid.",
    "Every club, association and alumni body we knew ran the same way. Renewals were chased by phone, receipts were typed by hand, and nobody was quite sure who was still a member.",
    "So we built Space Works Organization, one calm place for the whole year of a membership, and we run our own organisation on it first.",
  ],
  list: [
    "Plans and join forms in your organisation’s colours",
    "Approvals, renewals and reminders that send themselves",
    "Online and offline payments with GST-correct receipts",
    "Member cards anyone can check with a scan",
    "Reports the committee can read at a glance",
  ],
  outro: [
    "It is open source under the AGPL, so any organisation can read the code, run its own copy and keep its register on its own server.",
    "If you look after members, for a living or for love, we hope it gives you your evenings back.",
  ],
  closing: ["Fewer spreadsheets.", "More members.", "See you at the next general meeting."],
  signature: "Shaan Shoukath",
  team: [{ name: "Shaan Shoukath", role: "Systems Engineer, Space Works" }],
} as const;

/* Materials: paper stays paper in both colour modes. */
export const PAPER = "var(--sw-brand-warm-cream)";
export const INK = "var(--sw-brand-deep-ink)";
const PAPER_LINE = "rgb(20 44 42 / 0.14)";
export const HAIRLINE = "rgb(20 44 42 / 0.18)";

export function Lines({ count }: { count: number }) {
  return (
    <span className="flex flex-col gap-[11px]">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="block h-[2px] rounded-full" style={{ background: PAPER_LINE, width: index === count - 1 ? "58%" : "100%" }} />
      ))}
    </span>
  );
}

/** The opened letter, to read. It settles in once (a plain fade under reduced motion). */
export function ReadingLetter() {
  return (
    <article
      className="sw-note-letter relative mx-4 max-h-[calc(100dvh-32px)] w-full max-w-[640px] overflow-y-auto rounded-[6px] shadow-float"
      style={{ background: PAPER, color: INK }}
    >
      <div className="px-6 py-10 sm:px-12 sm:py-14">
        <header className="flex items-start justify-between gap-4 border-b pb-6" style={{ borderColor: PAPER_LINE }}>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] opacity-60">{LETTER.overline}</p>
            <h2 className="mt-2 font-accent text-[26px] font-medium leading-[1.15] sm:text-[32px]">{LETTER.title}</h2>
          </div>
          <SpaceWorksLogo variant="symbol" height={48} adaptive={false} label={null} className="mt-1" />
        </header>

        <div className="mt-7 flex flex-col gap-4 text-[17px] leading-[1.7] sm:text-[18px]">
          {LETTER.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <ul className="my-1 flex flex-col gap-1.5 border-l-2 pl-5" style={{ borderColor: "var(--sw-brand-maker-teal)" }}>
            {LETTER.list.map((entry) => <li key={entry}>{entry}</li>)}
          </ul>
          {LETTER.outro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <p className="flex flex-col gap-0.5 font-semibold">
            {LETTER.closing.map((text) => <span key={text}>{text}</span>)}
          </p>
        </div>

        <footer className="mt-10 flex flex-col gap-4">
          <p className="text-[20px] font-semibold">— {LETTER.signature}</p>
          <ul className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
            {LETTER.team.map((person) => (
              <li key={person.name}>
                <span className="font-semibold">{person.name}</span>
                <span className="opacity-70">, {person.role}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-60">Space Works Organization · open source</p>
        </footer>
      </div>
    </article>
  );
}
