import { describe, expect, it } from "vitest";
import { hasPkceVerifier, supabaseReturn } from "@/components/auth/supabaseReturn";

describe("Supabase bridge return decision", () => {
  it("does nothing when the page is opened without a return", () => {
    expect(supabaseReturn("", "", false)).toEqual({ action: "idle" });
    expect(supabaseReturn("?callbackUrl=%2Fdashboard", "", true)).toEqual({ action: "idle" });
  });
  it("exchanges a code only where this browser holds the PKCE verifier", () => {
    expect(supabaseReturn("?code=abcdef123456", "", true)).toEqual({ action: "exchange", code: "abcdef123456" });
    expect(supabaseReturn("?code=abcdef123456", "", false)).toEqual({ action: "refuse" });
  });
  it("never finishes from a pasted implicit-flow URL, verifier or not", () => {
    expect(supabaseReturn("", "#access_token=abc.def.ghi&refresh_token=x", true)).toEqual({ action: "refuse" });
    expect(supabaseReturn("", "#access_token=abc.def.ghi", false)).toEqual({ action: "refuse" });
  });
  it("refuses a malformed code", () => {
    expect(supabaseReturn("?code=%3Cscript%3E", "", true)).toEqual({ action: "refuse" });
  });
  it("finds a verifier in storage by its key suffix", () => {
    const store = (keys: string[]) => ({ length: keys.length, key: (index: number) => keys[index] ?? null });
    expect(hasPkceVerifier(store(["sb-abc-auth-token-code-verifier"]))).toBe(true);
    expect(hasPkceVerifier(store(["other", "sb-abc-auth-token"]))).toBe(false);
    expect(hasPkceVerifier(store([]))).toBe(false);
  });
});
