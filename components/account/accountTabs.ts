/** Tabs under the Account header. Add an entry here to add a tab. */
type AccountTab = { href: string; label: string };

const ACCOUNT_ROOT_HREF = "/account";

export const ACCOUNT_TABS: ReadonlyArray<AccountTab> = [
  { href: ACCOUNT_ROOT_HREF, label: "Memberships" },
  { href: "/account/payments", label: "Payments and receipts" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/privacy", label: "Data and privacy" },
  { href: "/account/organisations", label: "Organisations" },
  { href: "/account/security", label: "Security" },
];

/**
 * The root tab (the membership wallet) matches /account itself, each membership's page under
 * /account/memberships and the pay page under /account/pay; every other tab also matches its nested
 * paths (/account/security/anything).
 */
export function isAccountTabActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (href === ACCOUNT_ROOT_HREF) return path === ACCOUNT_ROOT_HREF || ["memberships", "pay"].some((section) => path.startsWith(`${ACCOUNT_ROOT_HREF}/${section}/`));
  return path === href || path.startsWith(`${href}/`);
}
