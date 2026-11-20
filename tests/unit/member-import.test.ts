import { describe, expect, it, vi } from "vitest";
import { parseCsv, toCsvRow } from "@/lib/csv";
import { mappingIsUsable, readRow, suggestMapping } from "@/lib/membership/importMapping";

vi.mock("@/lib/db", () => ({ prisma: {} }));
import { sheetCsvUrl } from "@/lib/googleSheets";

describe("CSV", () => {
  it("reads quoted fields, escaped quotes, embedded newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Name,Email,Notes\r\n"Shaan Shoukath",shaan@example.com,"Systems Engineer, ""SpaceWorks"""\r\n"Abhiram NJ",abhiram@example.com,"line one\nline two"\r\n\r\n');
    expect(rows).toEqual([
      ["Name", "Email", "Notes"],
      ["Shaan Shoukath", "shaan@example.com", 'Systems Engineer, "SpaceWorks"'],
      ["Abhiram NJ", "abhiram@example.com", "line one\nline two"],
    ]);
  });

  it("refuses too many rows", () => {
    expect(() => parseCsv("a\nb\nc\nd", 2)).toThrow(/more than 2 rows/);
  });

  it("writes cells that can never run as spreadsheet formulas", () => {
    expect(toCsvRow(["=HYPERLINK(\"x\")", "+1", "-2+3", "@cmd", "plain, comma", 'say "hi"', null])).toBe(`"'=HYPERLINK(""x"")",'+1,'-2+3,'@cmd,"plain, comma","say ""hi""",`);
  });

  it("keeps plain numbers, negative ones included, as numbers", () => {
    expect(toCsvRow([-1200.5, "-1200.50", "42", 0])).toBe("-1200.5,-1200.50,42,0");
  });
});

describe("import mapping", () => {
  const fields = [{ key: "college", label: "College" }];

  it("guesses columns from common headers and plan questions, each once", () => {
    expect(suggestMapping(["Full Name", "E-mail", "Mobile", "Chapter", "Designation", "College", "Email"], fields)).toEqual(["name", "email", "phone", "unit", "role", "field:college", "skip"]);
  });

  it("reads a row and reports why a row can't be used", () => {
    const mapping = suggestMapping(["Name", "Email", "Role", "College"], fields);
    expect(readRow(["Midlaj C", "MIDLAJ@Example.com", "Backend Engineer", "CET"], mapping)).toEqual({
      name: "Midlaj C", email: "midlaj@example.com", phone: null, stateCode: null, unit: null, role: "Backend Engineer", fieldValues: { college: "CET" }, groupings: {},
    });
    expect(readRow(["Ajzal P", "", "", ""], mapping)).toEqual({ error: "No email address" });
    expect(readRow(["Ajzal P", "not-an-email", "", ""], mapping)).toEqual({ error: "Email address isn't valid" });
    expect(readRow(["", "a@b.co", "", ""], mapping)).toEqual({ error: "No name" });
  });

  it("needs a name and email column, each used once", () => {
    expect(mappingIsUsable(["name", "skip"])).toMatch(/email/);
    expect(mappingIsUsable(["email", "skip"])).toMatch(/name/);
    expect(mappingIsUsable(["name", "email", "email"])).toMatch(/only one column/);
    expect(mappingIsUsable(["name", "email", "skip", "skip"])).toBeNull();
  });
});

describe("Google Sheets links", () => {
  it("turns a share link into its CSV export, keeping the tab", () => {
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=842")).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=842",
    );
    expect(sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing")).toMatch(/gid=0$/);
  });

  it("accepts only docs.google.com spreadsheet links over HTTPS", () => {
    expect(() => sheetCsvUrl("https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toThrow(/docs.google.com/);
    expect(() => sheetCsvUrl("http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toThrow();
    expect(() => sheetCsvUrl("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toThrow(/Google Sheets/);
    expect(() => sheetCsvUrl("not a link")).toThrow(/full link/);
  });
});
