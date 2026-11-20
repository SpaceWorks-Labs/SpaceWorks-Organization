import { notFound } from "next/navigation";
import { availableLoginMethods } from "@/lib/loginMethods";
import { firebaseConfig, supabaseConfig, type FirebaseConfig, type SupabaseConfig } from "@/lib/authBridges";

type BridgeView = { provider: "supabase"; config: SupabaseConfig } | { provider: "firebase"; config: FirebaseConfig };

/**
 * The public configuration for the Supabase or Firebase sign-in page, only while that method is available (switched
 * on and configured). Runs on the backend, so the website never reads the database.
 */
export async function loadBridgeView(provider: string): Promise<BridgeView> {
  if (provider !== "supabase" && provider !== "firebase") notFound();
  if (!(await availableLoginMethods()).includes(provider)) notFound();
  if (provider === "supabase") {
    const config = supabaseConfig();
    if (!config) notFound();
    return { provider, config };
  }
  const config = firebaseConfig();
  if (!config) notFound();
  return { provider, config };
}
