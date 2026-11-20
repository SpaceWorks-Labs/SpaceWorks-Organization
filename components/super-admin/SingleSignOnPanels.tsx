import { AdminPanel } from "@/components/super-admin/AdminPanel";
import { OidcProviders, type OidcRow } from "@/components/super-admin/OidcProviders";
import { SamlProviders, type SamlRow } from "@/components/super-admin/SamlProviders";

/** Single sign-on providers the operator sets up for the whole install: OpenID Connect and SAML 2.0. */
export function SingleSignOnPanels({ oidc, saml }: { oidc: OidcRow[]; saml: SamlRow[] }) {
  return (
    <>
      <AdminPanel title="OpenID Connect providers" description="Any number. A provider is used when its method above is on and the provider is enabled. Identities from these providers never link to an existing account by email.">
        <OidcProviders rows={oidc} />
      </AdminPanel>
      <AdminPanel title="SAML 2.0 providers" description="Single sign-on with your own identity provider. Give it the response address and metadata shown after you save.">
        <SamlProviders rows={saml} />
      </AdminPanel>
    </>
  );
}
