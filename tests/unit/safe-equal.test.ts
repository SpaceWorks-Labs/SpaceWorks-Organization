import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/safeEqual";

describe("safeEqual", () => {
  it("compares text exactly, whatever the lengths", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret!")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("ü", "ü")).toBe(true);
  });

  it("compares hex case-insensitively and refuses anything that is not hex", () => {
    expect(safeEqual("ab12cd", "AB12CD", "hex")).toBe(true);
    expect(safeEqual("ab12cd", "ab12ce", "hex")).toBe(false);
    expect(safeEqual("ab12", "ab12cd", "hex")).toBe(false);
    expect(safeEqual("zz", "zz", "hex")).toBe(false);
    expect(safeEqual("", "", "hex")).toBe(false);
  });

  it("compares base64url values by their decoded bytes", () => {
    const value = Buffer.from("signature-bytes").toString("base64url");
    expect(safeEqual(value, value, "base64url")).toBe(true);
    expect(safeEqual(value, Buffer.from("signature-bytez").toString("base64url"), "base64url")).toBe(false);
    expect(safeEqual(value, `${value}A`, "base64url")).toBe(false);
    expect(safeEqual("not base64!", "not base64!", "base64url")).toBe(false);
  });
});
