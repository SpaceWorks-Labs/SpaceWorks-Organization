/** Account.provider for a SAML link: the provider row's immutable id, never its editable slug or identity. */
export const SAML_PREFIX = "saml-";
export const samlProviderKey = (id: string) => `${SAML_PREFIX}${id}`;
