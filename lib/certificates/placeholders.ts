import type { CardSideSettings } from "@/lib/cards/design/elements";

/*
 * Words a certificate's text layers fill in when it is drawn. The certificate's own come first; the card
 * placeholders (the member's plan, unit chain and the organisation's contact details) work as on cards.
 * Anything else typed in braces is drawn as typed. Pure and client-safe.
 */

export const CERTIFICATE_PLACEHOLDERS = [
  { token: "{member.name}", label: "The member's name" },
  { token: "{member.number}", label: "The member's number" },
  { token: "{certificate.number}", label: "The certificate number" },
  { token: "{title}", label: "The certificate's title" },
  { token: "{reason}", label: "The reason or citation typed at issue" },
  { token: "{date}", label: "The date it was issued" },
  { token: "{plan}", label: "The member's plan" },
  { token: "{organisation}", label: "The organisation's name" },
  { token: "{unit}", label: "The member's unit" },
  { token: "{units}", label: "The member's unit chain, top level first" },
  { token: "{level1}", label: "The member's unit at the first level (to {level4})" },
  { token: "{website}", label: "The organisation's website (also {email}, {phone}, {contact})" },
] as const;

export type CertificateTextValues = {
  memberName: string;
  memberNumber: string;
  certificateNumber: string;
  title: string;
  reason: string;
  date: string;
};

const PATTERN = /\{(member\.name|member\.number|certificate\.number|title|reason|date)\}/g;

/**
 * A value is never read again as a placeholder: its braces get an invisible joiner after them (the text
 * engine drops it), so a reason containing "{name}" is printed as typed.
 */
const inert = (value: string) => value.replace(/\{/g, "{​");

export function fillCertificateText(text: string, values: CertificateTextValues) {
  const byKey: Record<string, string> = {
    "member.name": values.memberName,
    "member.number": values.memberNumber,
    "certificate.number": values.certificateNumber,
    title: values.title,
    reason: values.reason,
    date: values.date,
  };
  return text.replace(PATTERN, (_match, key: string) => inert(byKey[key] ?? ""));
}

/** The side with every text layer's certificate placeholders filled; the card engine fills the rest. */
export function withCertificateText(side: CardSideSettings, values: CertificateTextValues): CardSideSettings {
  return { ...side, layers: side.layers.map((layer) => (layer.kind === "text" ? { ...layer, text: fillCertificateText(layer.text, values) } : layer)) };
}
