import { describe, expect, it } from "vitest";
import { checkImportRows } from "@/lib/membership/importRows";
import type { ImportTarget } from "@/lib/membership/importMapping";

const units = [
  { id: "u-north", name: "North", slug: "north", code: "N", path: "u-north" },
  { id: "u-north-1", name: "North 1", slug: "north-1", code: "N1", path: "u-north/u-north-1" },
  { id: "u-south", name: "South", slug: "south", code: "S", path: "u-south" },
];
const roles = [
  { id: "r-member", name: "Volunteer", unitPath: null },
  { id: "r-north", name: "North lead", unitPath: "u-north" },
];
const mapping: ImportTarget[] = ["name", "email", "unit", "role"];

describe("checking import rows", () => {
  it("flags every kind of problem by row number and passes the rest", () => {
    const rows = [
      ["Asha Menon", "asha@example.test", "North 1", "North lead"],
      ["No Email", "", "North", ""],
      ["Bad Email", "not-an-email", "North", ""],
      ["Asha Again", "ASHA@example.test", "North", ""],
      ["Ghost", "ghost@example.test", "Atlantis", ""],
      ["Ravi K", "ravi@example.test", "S", "Treasurer"],
      ["Meera P", "meera@example.test", "south", "North lead"],
      ["Joseph T", "joseph@example.test", "n1", "volunteer"],
    ];
    const { ready, problems } = checkImportRows(rows, mapping, { units, roles, scopePath: null });
    expect(problems).toEqual([
      { row: 3, reason: "No email address" },
      { row: 4, reason: "Email address isn't valid" },
      { row: 5, reason: "Same email as row 2" },
      { row: 6, reason: 'No unit called "Atlantis"' },
      { row: 7, reason: 'No role called "Treasurer"' },
      { row: 8, reason: "North lead isn't offered in this member's unit" },
    ]);
    expect(ready.map((entry) => [entry.rowNumber, entry.unit?.id, entry.role?.id])).toEqual([
      [2, "u-north-1", "r-north"],
      [9, "u-north-1", "r-member"],
    ]);
  });

  it("keeps a scoped importer inside their subtree, and needs a unit from them", () => {
    const rows = [
      ["Asha Menon", "asha@example.test", "North 1", ""],
      ["Ravi K", "ravi@example.test", "South", ""],
      ["No Unit", "nounit@example.test", "", ""],
    ];
    const { ready, problems } = checkImportRows(rows, mapping, { units, roles, scopePath: "u-north" });
    expect(ready.map((entry) => entry.rowNumber)).toEqual([2]);
    expect(problems).toEqual([{ row: 3, reason: "Outside your unit" }, { row: 4, reason: "Outside your unit" }]);
  });

  it("flags existing members filed outside a scoped importer's subtree, wherever the row would put them", () => {
    const rows = [
      ["Asha Menon", "asha@example.test", "North 1", ""],
      ["Ravi K", "ravi@example.test", "North", ""],
      ["No Unit", "nounit@example.test", "North", ""],
      ["New Person", "new@example.test", "North", ""],
    ];
    const existing = new Map<string, string | null>([["asha@example.test", "u-north/u-north-1"], ["ravi@example.test", "u-south"], ["nounit@example.test", null]]);
    const { ready, problems } = checkImportRows(rows, mapping, { units, roles, scopePath: "u-north", existing });
    expect(ready.map((entry) => entry.rowNumber)).toEqual([2, 5]);
    expect(problems).toEqual([{ row: 3, reason: "Outside your unit" }, { row: 4, reason: "Outside your unit" }]);
    // Organisation-wide importers may update anyone.
    expect(checkImportRows(rows, mapping, { units, roles, scopePath: null, existing }).problems).toEqual([]);
  });

  it("judges a row without a unit by the existing member's own unit, for reach and for unit-limited roles", () => {
    const noUnit: ImportTarget[] = ["name", "email", "role"];
    const existing = new Map<string, string | null>([["asha@example.test", "u-north/u-north-1"], ["ravi@example.test", "u-south"]]);
    const rows = [["Asha Menon", "asha@example.test", "North lead"], ["Ravi K", "ravi@example.test", "North lead"], ["New Person", "new@example.test", ""]];
    const scoped = checkImportRows(rows, noUnit, { units, roles, scopePath: "u-north", existing });
    expect(scoped.ready.map((entry) => entry.row.email)).toEqual(["asha@example.test"]);
    expect(scoped.problems).toEqual([{ row: 3, reason: "Outside your unit" }, { row: 4, reason: "Outside your unit" }]);
    const orgWide = checkImportRows(rows, noUnit, { units, roles, scopePath: null, existing });
    expect(orgWide.problems).toEqual([{ row: 3, reason: "North lead isn't offered in this member's unit" }]);
  });
});
