import { z } from "zod";

const fieldMode = z.enum(["HIDDEN", "OPTIONAL", "REQUIRED"]).default("OPTIONAL");

export const joinFieldsSchema = z.object({
  phone: fieldMode,
  state: fieldMode,
  minors: z.boolean().default(true),
});

export type JoinFields = z.infer<typeof joinFieldsSchema>;
export const DEFAULT_JOIN_FIELDS: JoinFields = joinFieldsSchema.parse({});

export function parseJoinFields(value: unknown): JoinFields {
  return joinFieldsSchema.parse(value);
}

export function effectiveMinor(existing: { isMinor: boolean } | null | undefined, submitted: boolean, fields: JoinFields): boolean {
  return existing?.isMinor ?? (fields.minors && submitted);
}
