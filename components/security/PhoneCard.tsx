import { loadPhoneCardView } from "@/lib/views/account__phone";
import { PhoneCardForm } from "@/components/security/PhoneCardForm";

/**
 * Add, change or remove the phone number used for phone-code sign-in. Shows nothing while phone codes are off or not
 * set up (off means gone). Mount it on the account security page: `<PhoneCard />`.
 */
export async function PhoneCard() {
  const { available, maskedPhone } = await loadPhoneCardView();
  // A number already saved can still be removed while the method is off.
  if (!available && !maskedPhone) return null;
  return <PhoneCardForm available={available} maskedPhone={maskedPhone} />;
}
