import { loadInstanceSmsView } from "@/lib/views/super-admin__sms";
import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { InstanceSmsForm } from "@/components/super-admin/InstanceSmsForm";

/** The platform's SMS provider (Twilio or MSG91): what phone sign-in codes are sent through. */
export async function InstanceSmsPanel() {
  const view = await loadInstanceSmsView();
  return (
    <AdminPanel title="SMS" description="How phone sign-in codes are texted. Secrets are encrypted and never shown again. Each text carries only the code and the product name.">
      <InstanceSmsForm {...view} />
    </AdminPanel>
  );
}
