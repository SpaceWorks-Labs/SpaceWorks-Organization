/**
 * Currencies an organisation can price in. Amounts are always stored as integer minor units with an ISO 4217
 * code beside them; `exponent` is how many decimal places the minor unit has (paise: 2, fils: 3, yen: 0).
 * Client-safe: no server imports.
 */
export const CURRENCIES = {
  INR: { name: "Indian rupee", exponent: 2, locale: "en-IN" },
  USD: { name: "US dollar", exponent: 2, locale: "en-US" },
  EUR: { name: "Euro", exponent: 2, locale: "en-IE" },
  GBP: { name: "Pound sterling", exponent: 2, locale: "en-GB" },
  AED: { name: "UAE dirham", exponent: 2, locale: "en-AE" },
  SGD: { name: "Singapore dollar", exponent: 2, locale: "en-SG" },
  AUD: { name: "Australian dollar", exponent: 2, locale: "en-AU" },
  CAD: { name: "Canadian dollar", exponent: 2, locale: "en-CA" },
  NZD: { name: "New Zealand dollar", exponent: 2, locale: "en-NZ" },
  LKR: { name: "Sri Lankan rupee", exponent: 2, locale: "en-LK" },
  BDT: { name: "Bangladeshi taka", exponent: 2, locale: "en-BD" },
  NPR: { name: "Nepalese rupee", exponent: 2, locale: "en-NP" },
  QAR: { name: "Qatari riyal", exponent: 2, locale: "en-QA" },
  SAR: { name: "Saudi riyal", exponent: 2, locale: "en-SA" },
  OMR: { name: "Omani rial", exponent: 3, locale: "en-OM" },
  KWD: { name: "Kuwaiti dinar", exponent: 3, locale: "en-KW" },
  BHD: { name: "Bahraini dinar", exponent: 3, locale: "en-BH" },
  MYR: { name: "Malaysian ringgit", exponent: 2, locale: "en-MY" },
  ZAR: { name: "South African rand", exponent: 2, locale: "en-ZA" },
  JPY: { name: "Japanese yen", exponent: 0, locale: "en-JP" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

export function currencyExponent(code: CurrencyCode): number {
  return CURRENCIES[code].exponent;
}

/** Largest amount accepted anywhere, in major units, so totals stay well inside safe integers. */
const MAX_MAJOR = 100_000_000;

/**
 * Parse what a person typed ("1,200", "1200.5", "₹ 1,200.00") into minor units, or null when it is not a
 * valid amount for this currency (too many decimals, negative, or absurdly large). No floating point.
 */
export function parseAmount(input: string, code: CurrencyCode): number | null {
  const exponent = currencyExponent(code);
  const compact = input.trim().replace(/[\s,  ]/g, "");
  // A leading currency symbol or code is fine; a minus sign anywhere is not.
  if (compact.includes("-")) return null;
  const cleaned = compact.replace(/^[^\d.]+/, "");
  if (!cleaned) return null;
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  if (fraction.length > exponent) return null;
  if (whole.length > 12) return null;
  const major = Number(whole);
  if (major > MAX_MAJOR) return null;
  return major * 10 ** exponent + Number(fraction.padEnd(exponent, "0") || "0");
}

/** Minor units back to the plain editable string ("1200.50"), with no grouping or symbol. */
export function toInputValue(minor: number, code: CurrencyCode): string {
  const exponent = currencyExponent(code);
  if (exponent === 0) return String(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** exponent);
  const fraction = String(abs % 10 ** exponent).padStart(exponent, "0");
  return `${sign}${whole}.${fraction}`;
}

/** "₹1,200.00", "$12.50", "OMR 1.250". Uses the currency's own grouping unless a locale is given. */
export function formatMoney(minor: number, code: CurrencyCode, locale?: string): string {
  const exponent = currencyExponent(code);
  return new Intl.NumberFormat(locale ?? CURRENCIES[code].locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);
}

/** Display text for an amount in any currency code; a code Space Works does not list shows as "CODE minor". */
export function money(minor: number, currency: string, locale?: string | null): string {
  return isCurrencyCode(currency) ? formatMoney(minor, currency, locale ?? undefined) : `${currency} ${minor}`;
}

/** Add amounts that share one currency; refuses to mix currencies. */
export function sumMinor(amounts: Array<{ minor: number; currency: string }>, code: CurrencyCode): number {
  let total = 0;
  for (const amount of amounts) {
    if (amount.currency !== code) throw new Error("Cannot add amounts in different currencies.");
    total += amount.minor;
  }
  return total;
}

/** Group amounts by currency, the organisation's default first, for reports and totals. */
export function totalsByCurrency(amounts: Array<{ minor: number; currency: string }>, primary?: string) {
  const totals = new Map<string, number>();
  for (const amount of amounts) totals.set(amount.currency, (totals.get(amount.currency) ?? 0) + amount.minor);
  return [...totals.entries()]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => (a.currency === primary ? -1 : b.currency === primary ? 1 : a.currency.localeCompare(b.currency)));
}
