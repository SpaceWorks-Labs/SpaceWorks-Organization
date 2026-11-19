import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";
import { loadPrivacyTelemetryView } from "@/lib/views/app__privacy__page";
import type { ConfiguredProvider } from "@/lib/telemetry/configured";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information this Space Works Organization site collects, why, who can see it, how long it is kept and the choices you have.",
};

const PURPOSE_TEXT = { analytics: "usage analytics", replay: "session replay", diagnostics: "diagnostics and performance" } as const;

/** Without configured providers this site sets no tracking; with them, each is named with its purpose and needs consent first. */
function cookiesBody(providers: ConfiguredProvider[]): string | string[] {
  const base = "We use cookies only to keep you signed in, to protect forms against misuse and to remember your light or dark choice. We do not use advertising cookies.";
  if (providers.length === 0) return `${base} We do not use tracking cookies.`;
  const list = providers.map((item) => `${item.name} (${PURPOSE_TEXT[item.purpose]})`).join(", ");
  return [
    base,
    `The operator has switched on optional outside services for the public pages of this site: ${list}. Each is off until you agree to its purpose in Privacy preferences, which you can reopen from the footer at any time. Until then nothing is loaded from them and nothing is sent. They are never used on pages you sign in to, and they receive page types, not personal details. Your choice is kept in this browser only. Withdrawing stops them at once, but cannot delete what a provider already holds. The rules they follow are in section 8 of the Space Works product rules (docs/product-rules.md in the SpaceWorks-Design repository).`,
  ];
}

const buildSections = (providers: ConfiguredProvider[]): LegalSection[] => [
  {
    id: "who-is-responsible",
    title: "Who is responsible",
    body: [
      "Space Works Organization is open-source membership software from Space Works that anyone can run on their own server. In this policy, the “operator” is whoever runs this Space Works Organization site, and “organisations” are the clubs, associations, societies and other groups that run their memberships on it.",
      "The operator is responsible for accounts, security and the running of this site. Each organisation is responsible for the information it asks its members for and uses to run its memberships, such as its join form questions, member records, payments and receipts. Depending on where you live, the law may call the operator and the organisation a “controller” or a “data fiduciary” for that information.",
    ],
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: [
      "Your account. Your name, email address, password (stored only as a one-way hash), profile picture if you add one, whether you have verified your email, and your two-step verification settings.",
      "Your memberships. When you join an organisation, we store your name, email address, the answers you give on its join form (which can include a phone number, address, date of birth or a photo), your member number, your membership plan and the dates each membership period starts and ends, its status (for example pending approval, active, in grace, lapsed or cancelled), and your consent to the organisation’s privacy notice, including which version and when.",
      "Payments and receipts. When you pay for a membership, we store the amount, the plan it was for, how you paid (online through the organisation’s payment provider, or offline by cash, UPI, bank transfer or cheque), reference numbers such as a UPI transaction reference (UTR), and the receipts or tax invoices issued to you. Card and bank details are entered with the payment provider, not on this site, and are never stored here.",
      "Membership cards. Your card shows your name, photo if the organisation uses one, member number, plan and validity. Each card has a QR code that opens a public check page showing whether the card is valid.",
      "Organisations and teams. For each organisation we store its details, the people on its team and their roles, team invitations including any invited email address, and the platform’s review of its application.",
      "Uploads. Logos, profile pictures and member photos are checked, resized and re-encoded, and hidden metadata such as camera details and location is removed before they are stored.",
      "Technical and security information. Your IP address is used briefly to limit repeated requests and prevent abuse. It is not stored in our database. We keep an activity log of important actions, such as sign-ins, approvals, role changes, payments recorded, refunds and exports, recording who did what and when.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: [
      "We use this information to run the service: to create and secure your account, review organisation applications, take membership applications, approve members, issue member numbers and cards, take and record payments, issue receipts and tax invoices, send renewal reminders, and investigate security or technical problems.",
      "We process it because it is needed to provide the service you asked for, because the law requires it (for example, keeping tax records), because you gave your consent (for example, to an optional join form question or a member photo), or because we and the organisation have a legitimate interest in running memberships safely and accurately.",
    ],
  },
  {
    id: "who-can-see-it",
    title: "Who can see it",
    body: [
      "Organisations. People on an organisation’s team can see its members according to their role: owners and admins see and manage member records; treasurers see payments, receipts and finance reports; viewers see member lists with contact details hidden. Team members can export records they are allowed to see, and every export is logged.",
      "The public. A card’s check page shows only what is needed to confirm it: the name on the card, the organisation, the plan, whether it is valid and until when. It never shows contact details. Public organisation pages show only what the organisation publishes about itself and its plans.",
      "Payment providers. If you pay online, the organisation’s own payment provider (for example Razorpay or Stripe) processes the payment under its own privacy policy and receives the details it needs to do so.",
      "The operator. The operator’s administrators can see account and organisation details to review applications, support organisations and protect the site. Opening an organisation’s records is logged.",
    ],
  },
  {
    id: "other-services",
    title: "Other services we use",
    body: [
      "Google. If you sign in with Google, Google shares your basic profile with us under its own privacy policy.",
      "Email. Emails are sent through the operator’s email provider, which handles the recipient address and message to deliver them.",
      "Storage. Files may be stored with the operator’s storage provider in its configured region.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technology",
    body: cookiesBody(providers),
  },
  {
    id: "emails",
    title: "Emails we send",
    body: [
      "We send emails needed for the service: email verification, password resets, team invitations, application decisions, membership approvals and rejections, your membership card, payment receipts and renewal reminders before your membership expires.",
      "Renewal reminders are part of your membership. To stop receiving them, cancel your renewal from your account or contact the organisation.",
    ],
  },
  {
    id: "organisations-duties",
    title: "If you run an organisation",
    body: "Ask only for what you need to run your memberships, explain why you are asking, get consent for optional information and member photos, get a parent’s or guardian’s consent for members who are children, and limit who on your team can see contact details and payments.",
  },
  {
    id: "how-long-we-keep-it",
    title: "How long we keep it",
    body: [
      "Password-reset and email-verification links expire after one hour. Unused team invitations expire after seven days. Copies of sent emails are deleted after 30 days by default, and those containing sign-in or invitation links are deleted as soon as they are sent.",
      "Accounts and member records are kept until they are deleted by you, the organisation or the operator. Payment records, receipts and tax invoices are kept for at least eight years, because tax law requires it, even if the member record is erased. In that case the name and contact details on them are removed where the law allows, and the financial record stays.",
      "Backups may hold copies of deleted information for a limited time, as set by the operator. Ask the operator about their retention schedule.",
    ],
  },
  {
    id: "security",
    title: "Security",
    body: "Passwords are hashed, payment provider keys are encrypted, two-step verification is available for every account and required for platform administrators, and every important change is logged. Invitation and password-reset links work like keys, so do not share them. No system is perfectly secure. The operator is responsible for configuring its servers, backups and access securely, and for telling people about a data breach where the law requires it.",
  },
  {
    id: "your-choices-and-rights",
    title: "Your choices and rights",
    body: [
      "From your account you can update your profile, see your memberships, payments, receipts and cards, withdraw consent you gave to an organisation, download your information and ask for it to be erased.",
      "Depending on where you live, including under India’s Digital Personal Data Protection Act, you may also have the right to access, correct, complete, update or erase your information, to withdraw consent as easily as you gave it, to nominate someone to act for you, to have a grievance addressed, and to complain to a data protection authority.",
      "For anything about a specific organisation’s membership, contact that organisation. For your account, contact the operator. They will respond as required by the laws that apply to them. We may need to confirm who you are first.",
    ],
  },
  {
    id: "children",
    title: "Children",
    body: "If you are below the age at which you can consent to the use of your personal information where you live, a parent or guardian must give consent for you when you join. Organisations with members who are children are responsible for obtaining any parental consent the law requires.",
  },
  {
    id: "international-transfers",
    title: "Where your information is stored",
    body: "Your information is stored where the operator hosts this site and its providers. If that is outside your country, the operator is responsible for protecting the transfer as the law requires.",
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to this policy",
    body: "We may update this policy when the service or the way it handles information changes. The date at the top of this page shows when it last changed. If a change is significant, the operator will tell users where the law requires it.",
  },
  {
    id: "contact",
    title: "Contact",
    body: "For questions or requests about your information, contact the operator at [operator contact email — to be filled in by the operator], or its grievance officer at [grievance officer name and contact — to be filled in by the operator]. For anything about a particular membership, contact the organisation shown on its page.",
  },
];

export default async function PrivacyPage() {
  const { providers } = await loadPrivacyTelemetryView();
  return (
    <LegalPage
      current="privacy"
      title="Privacy"
      updated="19 October 2026"
      notice="This policy describes how Space Works Organization handles personal information. Each operator must replace the bracketed placeholders with its own name and contact details, add its hosting, email, storage and payment providers, retention periods and the laws that apply to it, and should have it reviewed by a lawyer. It is not legal advice."
      sections={buildSections(providers)}
    />
  );
}
