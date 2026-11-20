import { beforeAll, describe, expect, it } from "vitest";
import { codeHash, hashesMatch, maskPhone, parsePhone, phoneHash } from "@/lib/sms/phone";
import { countryDailyCap } from "@/lib/sms/codes";
import { asSmsCodePayload, smsText } from "@/lib/sms/outbox";

beforeAll(() => { process.env.AUTH_SECRET = "s".repeat(40); });

describe("phone numbers", () => {
  it("normalises to E.164 with the country calling code, and needs the country code", () => {
    expect(parsePhone("+91 98765 43210")).toEqual({ e164: "+919876543210", country: "91" });
    expect(parsePhone("+44 7911 123456")).toEqual({ e164: "+447911123456", country: "44" });
    expect(parsePhone("+1 (415) 555-2671")).toEqual({ e164: "+14155552671", country: "1" });
    expect(parsePhone("98765 43210")).toBeNull();
    expect(parsePhone("+91 123")).toBeNull();
    expect(parsePhone("not a number")).toBeNull();
    expect(parsePhone(12345)).toBeNull();
    expect(parsePhone("+".padEnd(80, "1"))).toBeNull();
  });
  it("hashes a number and a code with a keyed hash, bound to the row", () => {
    expect(phoneHash("+919876543210")).toBe(phoneHash("+919876543210"));
    expect(phoneHash("+919876543210")).not.toBe(phoneHash("+919876543211"));
    expect(phoneHash("+919876543210")).not.toContain("9876543210");
    expect(hashesMatch(codeHash("row1", "123456"), codeHash("row1", "123456"))).toBe(true);
    expect(hashesMatch(codeHash("row1", "123456"), codeHash("row2", "123456"))).toBe(false);
    expect(hashesMatch(codeHash("row1", "123456"), codeHash("row1", "123457"))).toBe(false);
    expect(hashesMatch("zz", "zz")).toBe(false);
  });
  it("needs a configured secret", () => {
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "short";
    expect(() => phoneHash("+919876543210")).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = saved;
  });
  it("masks a number to its last three digits", () => {
    expect(maskPhone("+919876543210")).toBe("+•• ••••• ••210");
  });
  it("reads the country cap from the environment, defaulting to 500", () => {
    expect(countryDailyCap({})).toBe(500);
    expect(countryDailyCap({ SMS_DAILY_COUNTRY_CAP: "120" })).toBe(120);
    expect(countryDailyCap({ SMS_DAILY_COUNTRY_CAP: "0" })).toBe(500);
    expect(countryDailyCap({ SMS_DAILY_COUNTRY_CAP: "abc" })).toBe(500);
  });
  it("sends the code and the product name only", () => {
    expect(smsText("123456")).toBe("123456 is your Space Works Organization code.");
  });
  it("accepts a well-formed outbox payload only", () => {
    const good = { codeId: "c1", to: "+919876543210", code: "123456", expiresAt: new Date().toISOString() };
    expect(asSmsCodePayload(good)).toEqual(good);
    expect(asSmsCodePayload({ ...good, to: "9876543210" })).toBeNull();
    expect(asSmsCodePayload({ ...good, code: "12345" })).toBeNull();
    expect(asSmsCodePayload({ ...good, codeId: "" })).toBeNull();
    expect(asSmsCodePayload(null)).toBeNull();
  });
});
