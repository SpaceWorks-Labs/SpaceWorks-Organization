import { requireAuth } from "@/lib/permissions";
import { loadPhoneCard } from "@/lib/sms/account";

/** What the account's phone card needs: whether phone codes exist here, and the saved number masked. */
export async function loadPhoneCardView() {
  const session = await requireAuth();
  return loadPhoneCard(session.user.id);
}
