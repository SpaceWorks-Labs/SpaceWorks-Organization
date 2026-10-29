/**
 * Checking every imported row before anything is written. Pure: the preview and the import run the same
 * checks, so a row the preview flagged is the row the import skips.
 */

import { readRow, type ImportRow, type ImportTarget } from "./importMapping";
import { pathWithin } from "./planUnits";

export type ImportUnit = { id: string; name: string; slug: string; code: string; path: string };
export type ImportRole = { id: string; name: string; unitPath: string | null };
export type CheckedRow = { rowNumber: number; row: ImportRow; unit: ImportUnit | null; role: ImportRole | null };
export type RowProblem = { row: number; reason: string };

/**
 * Sort rows (without the header) into ones ready to import and ones with a problem: unreadable (no name, bad
 * email), an email already used higher up the file, an unknown unit or role, a unit outside the importer's
 * reach (`scopePath`, null for the whole organisation), an existing member filed outside that reach (`existing`:
 * the unit path of each member already holding one of the file's emails), or a role limited to another part of
 * the organisation.
 * Row numbers count the header as row 1, as a spreadsheet shows them.
 */
export function checkImportRows(rows: string[][], mapping: ImportTarget[], context: { units: ImportUnit[]; roles: ImportRole[]; scopePath: string | null; existing?: Map<string, string | null> }) {
  const ready: CheckedRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();
  // A unit column may hold the unit's slug, name or code (any case).
  const unitBy = (text: string) => context.units.find((unit) => unit.slug === text.toLowerCase() || unit.name.toLowerCase() === text.toLowerCase() || unit.code === text.toUpperCase());
  for (const [index, cells] of rows.entries()) {
    const rowNumber = index + 2;
    const flag = (reason: string) => problems.push({ row: rowNumber, reason });
    const row = readRow(cells, mapping);
    if ("error" in row) {
      flag(row.error);
      continue;
    }
    const first = seen.get(row.email);
    if (first) {
      flag(`Same email as row ${first}`);
      continue;
    }
    seen.set(row.email, rowNumber);
    // Updating a member filed elsewhere would move them into the importer's unit: out of reach, like a new row.
    const existingPath = context.existing?.has(row.email) ? context.existing.get(row.email) ?? null : undefined;
    if (context.scopePath && existingPath !== undefined && !(existingPath && pathWithin(existingPath, context.scopePath))) {
      flag("Outside your unit");
      continue;
    }
    const unit = row.unit ? unitBy(row.unit) ?? null : null;
    if (row.unit && !unit) {
      flag(`No unit called "${row.unit.slice(0, 40)}"`);
      continue;
    }
    // Without a unit column an existing member keeps their unit, so judge the row by it.
    const unitPath = unit?.path ?? (row.unit ? null : existingPath ?? null);
    if (context.scopePath && !(unitPath && pathWithin(unitPath, context.scopePath))) {
      flag("Outside your unit");
      continue;
    }
    const role = row.role ? context.roles.find((entry) => entry.name.toLowerCase() === row.role!.toLowerCase()) ?? null : null;
    if (row.role && !role) {
      flag(`No role called "${row.role.slice(0, 40)}"`);
      continue;
    }
    // A role limited to a unit goes only to members in that unit's subtree, as when assigned by hand.
    if (role?.unitPath && !(unitPath && pathWithin(unitPath, role.unitPath))) {
      flag(`${role.name} isn't offered in this member's unit`);
      continue;
    }
    ready.push({ rowNumber, row, unit, role });
  }
  return { ready, problems };
}
