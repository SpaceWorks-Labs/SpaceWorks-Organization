import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminSettingsView } from "@/lib/views/app__super-admin__settings__page";
import { loadWebTelemetrySettingsView } from "@/lib/views/app__super-admin__settings__telemetry";
import { loadInstanceEmailProviderView } from "@/lib/views/app__super-admin__settings__email";
import { InstanceEmailProviderForm } from "@/components/super-admin/InstanceEmailProviderForm";
import { InstanceServiceSettingsForm } from "@/components/super-admin/InstanceServiceSettingsForm";
import { SignInProvidersForm } from "@/components/super-admin/SignInProvidersForm";
import { WebTelemetryForm } from "@/components/super-admin/WebTelemetryForm";
import { PageHeader, SectionHeading } from "@/components/ui/display";

export default async function SuperAdminSettingsPage() {
  await requireSuperAdmin();
  const [{ initial, providers }, telemetry, email] = await Promise.all([loadSuperAdminSettingsView(), loadWebTelemetrySettingsView(), loadInstanceEmailProviderView()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Instance settings" description="Email delivery, sign-in providers, web analytics and backup status for this instance. Secrets are encrypted and never displayed." />
      <section className="flex flex-col gap-4">
        <SectionHeading title="Sign-in providers" description="Offer Google, Apple or GitHub sign-in beside email and password. Accounts link by verified email." />
        <SignInProvidersForm initial={providers} />
      </section>
      <section className="flex flex-col gap-4">
        <SectionHeading title="Email provider" description="SMTP, Amazon SES, Resend or Postmark. Off until one is set up; no email is sent without it. Secrets are write-only." />
        <InstanceEmailProviderForm initial={email.initial} saved={email.saved} webhookUrls={email.webhookUrls} verifiedAt={email.verifiedAt} lastError={email.lastError} />
      </section>
      <section className="flex flex-col gap-4">
        <SectionHeading title="Email and backups" />
        <InstanceServiceSettingsForm initial={initial} />
      </section>
      <section className="flex flex-col gap-4">
        <SectionHeading title="Web analytics" description="Optional outside analytics for the public pages. Off by default, and only after a visitor agrees." />
        <WebTelemetryForm initial={telemetry.initial} allowedOrigins={telemetry.allowedOrigins} mixpanelOn={telemetry.mixpanelOn} />
      </section>
    </div>
  );
}
