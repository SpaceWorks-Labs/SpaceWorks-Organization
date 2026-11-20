import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

import { recordAuditEvent } from "@/lib/audit";
import { auditAnswerChange, changedAnswerKeys, changedCoreFields, keysText } from "@/lib/membership/answerAudit";

describe("answer audit", () => {
  it("lists the keys whose stored answer differs, sorted, never the values", () => {
    expect(changedAnswerKeys({ b: "1", a: "x", same: ["p", "q"] }, { b: "2", c: "new", same: ["p", "q"] })).toEqual(["a", "b", "c"]);
    expect(changedAnswerKeys(undefined, {})).toEqual([]);
    expect(changedAnswerKeys({ a: null }, {})).toEqual([]);
  });

  it("truncates a long key list at a whole key", () => {
    const keys = Array.from({ length: 60 }, (_, index) => `question_${index}`);
    const text = keysText(keys);
    expect(text.length).toBeLessThan(215);
    expect(text.endsWith(",...")).toBe(true);
    expect(keysText(["a", "b"])).toBe("a,b");
  });

  it("names the core fields that changed", () => {
    const base = { name: "A", email: "a@x.test", phone: null, stateCode: "KL", unitId: "u1", isMinor: false, guardianName: null, guardianEmail: null, guardianPhone: null };
    expect(changedCoreFields(base, { ...base, name: "B", unitId: "u2", phone: "123" })).toEqual(["name", "phone", "unit"]);
    expect(changedCoreFields(base, base)).toEqual([]);
  });

  it("writes keys, source and member, and nothing when no answer changed", async () => {
    const tx = {} as never;
    await auditAnswerChange(tx, { organisationId: "o1", actorUserId: "u1", memberId: "m1", before: { shirt: "S" }, after: { shirt: "Private" }, by: "member" });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "MEMBER_ANSWERS_CHANGED", targetId: "m1", metadata: { keys: "shirt", by: "member", memberId: "m1" } }));
    expect(JSON.stringify(vi.mocked(recordAuditEvent).mock.calls)).not.toContain("Private");
    vi.mocked(recordAuditEvent).mockClear();
    await auditAnswerChange(tx, { organisationId: "o1", actorUserId: null, memberId: "m1", before: { a: 1 }, after: { a: 1 }, by: "import" });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
