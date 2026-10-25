import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUMBER_FORMAT,
  formatCardNumberFrom,
  formatUsesYear,
  normalizeNumberFormat,
  numberCounterName,
  numberFormatError,
  yearIn,
} from "@/lib/cards/numbering";

const parts = { prefix: "SWO", seq: 42, memberNumber: 7, year: 2026 };

describe("card number patterns", () => {
  it("formats the default pattern from the running number", () => {
    expect(formatCardNumberFrom(DEFAULT_NUMBER_FORMAT, parts)).toBe("SWO-0042");
    expect(formatCardNumberFrom(DEFAULT_NUMBER_FORMAT, { ...parts, seq: 12345 })).toBe("SWO-12345");
  });

  it("formats every token", () => {
    expect(formatCardNumberFrom("{PREFIX}/{YYYY}/{SEQ:3}", parts)).toBe("SWO/2026/042");
    expect(formatCardNumberFrom("{PREFIX}{YY}-{MEMBER:4}-{SEQ}", parts)).toBe("SWO26-0007-42");
    expect(formatCardNumberFrom("SEC {SEQ:2}", { ...parts, year: 2009 })).toBe("SEC 42");
  });

  it("requires the running number, so a new registration always gets a new number", () => {
    expect(numberFormatError("{PREFIX}-{MEMBER:4}")).toMatch(/\{SEQ\}/);
    expect(numberFormatError("{PREFIX}-{SEQ:4}")).toBeNull();
    expect(numberFormatError("{prefix}-{seq:4}")).toBeNull();
    expect(normalizeNumberFormat(" {prefix}-{seq:4} ")).toBe("{PREFIX}-{SEQ:4}");
  });

  it("rejects lengths on tokens that take none, unknown characters and long patterns", () => {
    expect(numberFormatError("{PREFIX:2}-{SEQ}")).toMatch(/length/);
    expect(numberFormatError("{SEQ}#")).toMatch(/capital letters/);
    expect(numberFormatError("{SEQ}{NAME}")).toMatch(/capital letters/);
    expect(numberFormatError(`{SEQ}${"A".repeat(40)}`)).toMatch(/40/);
    expect(numberFormatError("  ")).toMatch(/Enter/);
  });

  it("keeps a separate running number per role, restarting yearly when the pattern has a year", () => {
    expect(formatUsesYear("{PREFIX}-{SEQ}")).toBe(false);
    expect(formatUsesYear("{YY}{SEQ}")).toBe(true);
    expect(numberCounterName({ roleId: null }, null)).toBe("card");
    expect(numberCounterName({ roleId: "r1" }, null)).toBe("card:role:r1");
    expect(numberCounterName({ roleId: "r1" }, 2026)).toBe("card:role:r1:2026");
  });

  it("reads the year in the organisation's time zone", () => {
    const newYearUtc = new Date("2026-12-31T20:00:00Z");
    expect(yearIn("Asia/Kolkata", newYearUtc)).toBe(2027);
    expect(yearIn("UTC", newYearUtc)).toBe(2026);
  });
});
