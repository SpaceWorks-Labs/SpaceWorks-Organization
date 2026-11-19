/**
 * Every feature area of Space Works Organization, in one place, so the landing page's area headlines, /features
 * and the docs links cannot drift apart. Each fact is taken from CLAUDE.md, docs/features/*.md, docs/*.md and
 * lib/permissionRoles.ts; permissions are named exactly as CAPABILITY_LIST spells them.
 */

/** The docs viewer's feature pages (/docs/<slug>), in reading order. */
export const DOCS_SLUGS = [
  "organisations", "units", "staff-and-roles", "sign-in", "plans-and-join-forms", "renewals", "payments", "receipts-and-refunds",
  "member-cards", "member-portal", "public-page", "reports-and-analytics", "notifications", "web-analytics", "self-hosting",
] as const;

export type DocsSlug = (typeof DOCS_SLUGS)[number];

export type FeatureArea = {
  /** Anchor on /features (#id) and the landing page's link target. */
  id: DocsSlug;
  title: string;
  /** One line: the landing page shows only this, at headline level. */
  summary: string;
  /** What it does. */
  does: readonly string[];
  /** Who can use it: roles and the permissions that gate it. */
  who: readonly string[];
  /** How to switch it on or off. */
  toggle: readonly string[];
  docsSlug: DocsSlug;
  /** The release that brought it, shown as "New in <release>" while it is recent. */
  since?: string;
};

export const FEATURE_AREAS: readonly FeatureArea[] = [
  {
    id: "organisations", docsSlug: "organisations", title: "Organisations",
    summary: "Each organisation is its own tenant, with its own members, money, team and settings.",
    does: [
      "One platform runs many organisations. Members, money and settings never cross from one to another; a link into another organisation's records shows not found.",
      "Anyone can apply to run an organisation here, and the platform super admin reviews each application before it opens, or creates one directly.",
      "An organisation is public, listed in the directory at /organisations, or unlisted and reached only by its link.",
      "The super admin sets member and team limits per organisation and sees the whole platform, and can act in any organisation as its owner. That needs an authenticator, never takes a team seat and is written to the audit log.",
    ],
    who: [
      "Anyone with an account can apply. The platform super admin approves, declines or creates organisations.",
      "Settings need org.settings. Deleting the organisation and transferring ownership are the Owner's alone.",
    ],
    toggle: ["The super admin switches new account sign-ups on or off for the platform.", "Each organisation chooses whether it is listed in the directory."],
  },
  {
    id: "units", docsSlug: "units", title: "Units",
    summary: "Areas, branches and chapters, named the way your organisation names them.",
    does: [
      "Name up to four levels yourself, for example Area then Unit. Nothing about the levels is fixed by the product.",
      "Build a tree of units. Each unit has a code of 1 to 6 letters or digits, unique in the organisation.",
      "Join links carry the code (?unit=CODE), so people join the right unit, and card numbers can include it.",
      "A unit moves only to another parent on the same level, taking its subtree with it. Levels and card numbers never change.",
      "A plan limited to some units is offered to everything below them too.",
    ],
    who: [
      "Building and changing the tree needs structure.manage.",
      "Staff given a role for one unit see and act only inside that unit and the units below it. They can read, but not change, organisation-wide settings.",
    ],
    toggle: ["Units are optional: an organisation without any simply has no unit level.", "Levels and names are set in Settings, under structure."],
  },
  {
    id: "staff-and-roles", docsSlug: "staff-and-roles", title: "Staff and roles",
    summary: "Custom roles from a fixed list of permissions, for the whole organisation or one unit.",
    does: [
      "Build your own roles from a fixed list of permissions, such as members.view, payments.manage, reports.finance and cards.design.",
      "Four starter roles come ready: Owner, Manager, Treasurer and Viewer. The Owner holds every permission and is never edited or given by invite.",
      "A role is held for the whole organisation or for one unit, and people join the team through a single-use invite link carrying both.",
      "You can give someone only a role that grants strictly less than your own, inside your own reach.",
      "Every member of staff sets up an authenticator app before the dashboard opens.",
    ],
    who: ["Managing the team needs team.manage; creating and editing roles needs roles.manage.", "Transferring ownership is the Owner's alone."],
    toggle: ["Roles and the team are always on.", "Only staff need an authenticator; members never do."],
  },
  {
    id: "sign-in", docsSlug: "sign-in", title: "Sign-in", since: "0.9.0",
    summary: "Email and password, Google, Apple or GitHub, and optional Supabase or Firebase accounts.",
    does: [
      "People sign in with an email and password, or with Google, Apple or GitHub once the platform has set them up.",
      "Supabase and Firebase can act as identity providers: their own sign-in opens, and the result counts only when the provider confirms the email address.",
      "A staff invite link lets someone create an account on the spot, even while new sign-ups are switched off.",
      "Staff still set up an authenticator before the dashboard opens, and super admins always use an email and password set on the server.",
    ],
    who: ["Anyone with an account signs in.", "Which methods are offered is the platform operator’s choice, made at install or in Super admin, Auth."],
    toggle: ["The installer asks which sign-in options to offer; bash scripts/admin.sh login-methods changes them later.", "Each method can be switched off without losing its settings."],
  },
  {
    id: "plans-and-join-forms", docsSlug: "plans-and-join-forms", title: "Plans and join forms",
    summary: "What people can join, and a form that asks exactly what you need to know.",
    does: [
      "A plan has a name, a fee, a period and optional joining and rejoining fees, and can need approval.",
      "Applications to approval plans wait in one queue with every answer until staff approve or decline them.",
      "Join forms are built per plan: built-in fields, your own questions, choose-several answers, sections and questions that appear only when an earlier answer calls for them.",
      "A plan can ask for a photo when someone joins. Each question keeps one answer per member, even across several plans.",
      "A public join page and unit join links bring people in.",
    ],
    who: ["Plans and their forms need plans.manage.", "Approving and managing members needs members.manage; staff limited to a unit approve only inside it."],
    toggle: ["Each plan accepts applications or not, and needs approval or not.", "Each question is shown or hidden on the plan it belongs to."],
  },
  {
    id: "renewals", docsSlug: "renewals", title: "Renewals",
    summary: "Terms that move from active to grace to lapsed on their own, with reminders on the way.",
    does: [
      "Each membership is a term with a start, an end and, where the plan allows, a grace period.",
      "A background job moves terms through active, in grace and lapsed, and sends renewal reminders.",
      "Members renew early or late from their account and keep the same card and number.",
      "Staff send reminders in bulk from the renewals worklist, one manual reminder per membership per day.",
      "A lapsed member can rejoin, paying a joining or rejoining fee if the plan sets one.",
    ],
    who: ["Renewing, reinstating and sending reminders needs members.manage.", "The renewals report needs reports.membership."],
    toggle: ["Reminders and grace are set on each plan.", "With member accounts off, members renew through a signed pay link in the email instead."],
  },
  {
    id: "payments", docsSlug: "payments", title: "Payments",
    summary: "Razorpay or Stripe online, and UPI, bank transfer, cash and cheque offline.",
    does: [
      "Each organisation picks one online gateway, Razorpay or Stripe, or none. Offline payment is always available.",
      "Offline covers UPI QR, bank transfer, cash and cheque. Staff record it, or the member says “I've paid” with a reference that a manager then confirms.",
      "Units can have their own payment instructions, and a collection sheet records one transaction per member.",
      "Members who cannot sign in pay through a signed link in their email. Amounts are kept in whole paise.",
      "Gateway keys are stored encrypted and never sent back to the browser.",
    ],
    who: ["Seeing payments needs payments.view; recording and confirming them needs payments.manage.", "Gateway and tax settings need payments.settings."],
    toggle: ["Save gateway keys in Settings, under payments and tax, to switch a gateway on.", "Without the platform's PAYMENT_SECRETS_KEY the gateway section stays locked and only offline payment works."],
  },
  {
    id: "receipts-and-refunds", docsSlug: "receipts-and-refunds", title: "Receipts and refunds",
    summary: "GST receipts numbered without gaps, and corrections that leave a trail.",
    does: [
      "Every paid payment gets a GST receipt or tax invoice, or a simple receipt where GST does not apply.",
      "Numbers never skip within a financial year, April to March in the organisation's time zone.",
      "A paid payment is never edited or deleted: a mistake is reversed with a credit note.",
      "Members can ask for a refund under the organisation's refund policy, and staff approve or decline it. Approved refunds go back through the gateway, which is followed up automatically.",
      "Other income and expenses go in an accounts ledger, where an entry is voided once and never deleted.",
    ],
    who: [
      "Credit notes and refunds need payments.manage; the accounts ledger needs accounts.manage.",
      "GSTR-1 tables need reports.gstr1, which is for the whole organisation only.",
    ],
    toggle: ["The tax mode is chosen in Settings, under payments and tax.", "The organisation sets its own refund policy."],
  },
  {
    id: "member-cards", docsSlug: "member-cards", title: "Member cards",
    summary: "One live ID card per member and plan, with a QR anyone can scan to check it.",
    does: [
      "A card is issued when a membership first becomes active, and renewals keep it. Scanning the QR shows its live status.",
      "A card designer sets colours, fonts and layout, with different designs per role.",
      "Managers save drafts; only the Owner approves one, and members' cards keep the approved design until then.",
      "Card numbers follow your own pattern with a running sequence. Cards are drawn on demand as matching PDF and PNG, never stored.",
      "Staff of the card's organisation who scan it see the member's record, inside their unit scope. Everyone else sees only whether it is valid.",
      "Bulk downloads give a ZIP of PDFs or one combined PDF.",
    ],
    who: ["Issuing, reissuing and emailing cards needs cards.manage; designs need cards.design.", "Approving a design needs cards.approve, the Owner's alone."],
    toggle: ["Cards are always on for active memberships.", "The public check page works whether or not member accounts are on."],
  },
  {
    id: "member-portal", docsSlug: "member-portal", title: "Member portal",
    summary: "Members see their memberships, payments, receipts and cards in one account.",
    does: [
      "Members see their memberships, history, payments and receipts at /account, found by their verified email address.",
      "They renew, withdraw a renewal, leave and ask for a refund there.",
      "Where the organisation allows it, they upload their own card photo.",
      "They can download their data and ask to be erased. Erasure anonymises the person; money records are kept.",
    ],
    who: ["Any member with a verified account.", "Staff decide erasure requests with erasure.decide."],
    toggle: ["Member accounts are a switch on each organisation. Off, emails link to the public page or a signed pay link instead.", "Member photo upload is a separate switch, off by default."],
  },
  {
    id: "public-page", docsSlug: "public-page", title: "Public page",
    summary: "A page at /o/<your-organisation> that says who you are and how to join.",
    does: [
      "A sections editor builds the page from text, links, images and plans.",
      "Text uses a small Markdown subset and is always shown as text, never raw HTML. Links must be web, email or phone links, and images must be your own uploads.",
      "Changes stay a draft until you publish; you can discard them or unpublish.",
      "The page can use the organisation's own accent colour, checked for readable contrast.",
    ],
    who: ["Editing the page needs org.settings."],
    toggle: ["Publish and Unpublish decide whether the page is visible.", "Being listed in the directory is a separate setting."],
  },
  {
    id: "reports-and-analytics", docsSlug: "reports-and-analytics", title: "Reports and analytics",
    summary: "Membership, renewals, money and tax, counted the same way every time.",
    does: [
      "Reports cover the overview, units, members, renewals, applications, money, tax and receipts, and team activity, filtered by period, plan and unit.",
      "The units report compares the units one level down and drills into each.",
      "Reports export as CSV, and the overview prints as a PDF snapshot.",
      "The super admin's platform analytics compare organisations with counts and totals only, never a member's name, email or phone.",
      "Every figure is counted in house from the application's own data.",
    ],
    who: [
      "Membership reports need reports.membership; money and tax need reports.finance; team activity needs audit.view.",
      "Staff limited to a unit see only their units. Platform analytics are for the super admin.",
    ],
    toggle: ["Reports are always on."],
  },
  {
    id: "notifications", docsSlug: "notifications", title: "Notifications",
    summary: "Member emails in your organisation's name, and team alerts in your chat.",
    does: [
      "Notices, reminders, receipts and cards go out in the organisation's name, through its own SMTP server or the platform's.",
      "Change the wording of member emails with plain-text templates and placeholders.",
      "Team alerts go to Slack, Discord, Mattermost, Telegram or WhatsApp: new applications, payments, refund and erasure requests, and a monthly summary.",
      "Messages are queued with the change that causes them, so a change that fails sends nothing.",
    ],
    who: ["Owners and Managers manage email and chat settings."],
    toggle: ["Each chat channel picks its own alerts and can be switched off.", "The organisation's own email settings switch on or off, and a test email checks them."],
  },
  {
    id: "web-analytics", docsSlug: "web-analytics", title: "Web analytics", since: "0.9.0",
    summary: "Optional visitor analytics for public pages, off until you set it up.",
    does: [
      "Providers such as Plausible, Umami, Google Analytics 4, PostHog and Mixpanel are all off by default. With none set up, no script loads and nothing is stored.",
      "Scripts load only after a visitor agrees in the consent banner, and withdrawing consent stops them at once.",
      "Only page route templates are sent, never free text, query strings, names or email addresses.",
      "The platform sets up providers for the whole site, and each organisation can set up its own for its public pages.",
    ],
    who: ["The platform super admin for the whole site.", "Each organisation's team for its own public pages."],
    toggle: ["Save a provider's public identifier in settings to switch it on; remove it to switch it off."],
  },
  {
    id: "self-hosting", docsSlug: "self-hosting", title: "Self-hosting",
    summary: "Free software under the AGPL. Install it on your own server with one command.",
    does: [
      "A one-line installer sets up a single server with Docker: it checks the host, asks its questions first and starts the whole stack.",
      "Three layouts: one server (VPS), managed cloud services, or a hybrid with the public pages on Netlify.",
      "Backups cover the database and stored files, with an optional off-site copy, and restore from the menu.",
      "Updates and rollbacks are one command each.",
      "Super admin accounts are created on the server only, never in the app.",
    ],
    who: ["Whoever runs the server. Inside the product, only the platform super admin sees platform settings."],
    toggle: ["Optional parts, such as bundled storage or the Netlify frontend, are chosen when you install."],
  },
];

/** One area by id; undefined for an unknown id. */
export function featureArea(id: string): FeatureArea | undefined {
  return FEATURE_AREAS.find((area) => area.id === id);
}
