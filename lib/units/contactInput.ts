import { isSafeLink } from "@/lib/publicPage/links";

/*
 * Checking the contact details typed for an area (unit). An empty string clears a detail (null). Pure and
 * client-safe, so the form can show the same messages before it saves.
 */

export type UnitContactInput = { contactEmail: string; contactPhone: string; website: string };
export type UnitContactValues = { contactEmail: string | null; contactPhone: string | null; website: string | null };
export type UnitContactErrors = Partial<Record<keyof UnitContactInput, string>>;

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;
const PHONE = /^[0-9 +()-]{6,20}$/;
const EMAIL_MAX = 254;
const WEBSITE_MAX = 200;

/** The values to store, or the message for each detail that fails. */
export function checkUnitContact(input: UnitContactInput): { ok: true; values: UnitContactValues } | { ok: false; errors: UnitContactErrors } {
  const email = input.contactEmail.trim();
  const phone = input.contactPhone.trim();
  const website = input.website.trim();
  const errors: UnitContactErrors = {};
  if (email && (email.length > EMAIL_MAX || !EMAIL.test(email))) errors.contactEmail = "Enter an email address, such as name@example.org.";
  if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 5)) errors.contactPhone = "Use 6 to 20 digits, spaces, + - and brackets.";
  if (website && (website.length > WEBSITE_MAX || !/^https?:\/\//i.test(website) || !isSafeLink(website))) errors.website = "Enter a web address starting with https:// or http://.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { contactEmail: email.toLowerCase() || null, contactPhone: phone || null, website: website || null } };
}
