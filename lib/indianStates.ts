/**
 * Indian states and union territories: ISO 3166-2:IN code (stored on organisations and members),
 * display name, and the two-digit GST state code used for place of supply on tax documents.
 */
export const INDIAN_STATES = [
  { code: "AN", name: "Andaman and Nicobar Islands", gst: "35" },
  { code: "AP", name: "Andhra Pradesh", gst: "37" },
  { code: "AR", name: "Arunachal Pradesh", gst: "12" },
  { code: "AS", name: "Assam", gst: "18" },
  { code: "BR", name: "Bihar", gst: "10" },
  { code: "CH", name: "Chandigarh", gst: "04" },
  { code: "CT", name: "Chhattisgarh", gst: "22" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", gst: "26" },
  { code: "DL", name: "Delhi", gst: "07" },
  { code: "GA", name: "Goa", gst: "30" },
  { code: "GJ", name: "Gujarat", gst: "24" },
  { code: "HR", name: "Haryana", gst: "06" },
  { code: "HP", name: "Himachal Pradesh", gst: "02" },
  { code: "JK", name: "Jammu and Kashmir", gst: "01" },
  { code: "JH", name: "Jharkhand", gst: "20" },
  { code: "KA", name: "Karnataka", gst: "29" },
  { code: "KL", name: "Kerala", gst: "32" },
  { code: "LA", name: "Ladakh", gst: "38" },
  { code: "LD", name: "Lakshadweep", gst: "31" },
  { code: "MP", name: "Madhya Pradesh", gst: "23" },
  { code: "MH", name: "Maharashtra", gst: "27" },
  { code: "MN", name: "Manipur", gst: "14" },
  { code: "ML", name: "Meghalaya", gst: "17" },
  { code: "MZ", name: "Mizoram", gst: "15" },
  { code: "NL", name: "Nagaland", gst: "13" },
  { code: "OR", name: "Odisha", gst: "21" },
  { code: "PY", name: "Puducherry", gst: "34" },
  { code: "PB", name: "Punjab", gst: "03" },
  { code: "RJ", name: "Rajasthan", gst: "08" },
  { code: "SK", name: "Sikkim", gst: "11" },
  { code: "TN", name: "Tamil Nadu", gst: "33" },
  { code: "TG", name: "Telangana", gst: "36" },
  { code: "TR", name: "Tripura", gst: "16" },
  { code: "UP", name: "Uttar Pradesh", gst: "09" },
  { code: "UT", name: "Uttarakhand", gst: "05" },
  { code: "WB", name: "West Bengal", gst: "19" },
] as const;

type IndianStateCode = (typeof INDIAN_STATES)[number]["code"];

const BY_CODE = new Map<string, (typeof INDIAN_STATES)[number]>(INDIAN_STATES.map((state) => [state.code, state]));

export function isIndianStateCode(value: unknown): value is IndianStateCode {
  return typeof value === "string" && BY_CODE.has(value);
}

export function indianStateName(code: string | null | undefined) {
  return code ? BY_CODE.get(code)?.name ?? null : null;
}

export function gstStateCode(code: string | null | undefined) {
  return code ? BY_CODE.get(code)?.gst ?? null : null;
}
