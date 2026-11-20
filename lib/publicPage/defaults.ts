import { EMPTY_ACTION } from "./sectionSchemas";
import { SECTION_LABELS, type PageDocument, type PageSection, type SectionType } from "./sections";

/** A random section id (10 of a–z0–9). */
export function newSectionId(random: () => number = Math.random) {
  return Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
}

type OrgContact = { contactEmail?: string | null; contactPhone?: string | null };
const none = () => ({ ...EMPTY_ACTION });

/** A new section of a type, with sensible starting content. */
export function newSection(type: SectionType, id = newSectionId(), org?: OrgContact): PageSection {
  const common = { id, visible: true, title: SECTION_LABELS[type].label };
  switch (type) {
    case "hero": return { ...common, type, title: "", headline: "", subtitle: "", imageKey: null, imageAlt: "", layout: "split", primary: { ...none(), kind: "plans", label: "See membership plans" }, secondary: none() };
    case "cta": return { ...common, type, title: "", headline: "Ready to join?", body: "", tone: "accent", primary: { ...none(), kind: "plans", label: "Become a member" }, secondary: none() };
    case "counts": return { ...common, type, title: "Our members", intro: "", total: true, byPlan: false, byUnit: false };
    case "card": return { ...common, type, title: "Your member card", intro: "Every member gets a card with their own name and a QR code anyone can check." };
    case "about": return { ...common, type, title: "About us", markdown: "" };
    case "plans": return { ...common, type, title: "Membership", intro: "" };
    case "units": return { ...common, type, title: "Where we are", intro: "" };
    case "committee": return { ...common, type, intro: "", people: [] };
    case "testimonials": return { ...common, type, title: "What members say", items: [] };
    case "timeline": return { ...common, type, title: "Our story", items: [] };
    case "stats": return { ...common, type, title: "", items: [] };
    case "imageText": return { ...common, type, title: "", imageKey: null, imageAlt: "", markdown: "", side: "left", primary: none() };
    case "video": return { ...common, type, title: "", url: "", caption: "" };
    case "gallery": return { ...common, type, title: "Gallery", images: [] };
    case "downloads": return { ...common, type, intro: "", files: [] };
    case "faq": return { ...common, type, items: [] };
    case "links": return { ...common, type, title: "Find us online", links: [] };
    case "contact": return { ...common, type, title: "Get in touch", email: org?.contactEmail ?? "", phone: org?.contactPhone ?? "", address: "", hours: "" };
    case "map": return { ...common, type, title: "Find us", address: "", url: "", label: "Open in maps" };
    case "text": return { ...common, type, title: "", body: "" };
  }
}

/** A copy of a section with a new id, placed by the caller (the editor's Duplicate). */
export function duplicateSection(section: PageSection, id = newSectionId()): PageSection {
  return { ...structuredClone(section), id };
}

/** A first draft for an organisation that has never edited its page: about, plans and contact. */
export function starterDocument(org: { description: string } & OrgContact, makeId = newSectionId): PageDocument {
  const about = newSection("about", makeId());
  const sections: PageSection[] = [
    about.type === "about" ? { ...about, markdown: org.description } : about,
    newSection("plans", makeId()),
    newSection("contact", makeId(), org),
  ];
  return { tagline: "", coverAssetKey: null, accentColor: null, sections };
}
