import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/** The keys of the validated environment (lib/env.ts), plus the ones the code reads without validating. */
function schemaKeys() {
  const source = read("lib/env.ts");
  const body = source.slice(source.indexOf("z.object({"));
  return [...new Set([...body.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]))];
}

const mentions = (text: string, key: string) => new RegExp(`(^|[^A-Z0-9_])${key}([^A-Z0-9_]|$)`, "m").test(text);

/** Set by the platform or by scripts and tests, never by an operator in an environment file. */
const NOT_IN_COMPOSE = new Set([
  "ALLOW_INSECURE_PRODUCTION_TESTS", // CI only: lets the production-mode test suite run over plain HTTP
  "BACKUP_LAST_SUCCESS_AT", // written by scripts/backup.sh on the host for the operations page
  "JOBS_INPROCESS", // local development without Redis; the compose stacks run the worker and beat roles
  "ALLOWED_ACTION_ORIGINS", // build time only (next.config.ts); release images refuse it
]);

/** The cloud stack sits behind your platform's HTTPS edge and never serves plain HTTP. */
const NOT_IN_CLOUD = new Set(["ALLOW_PLAIN_HTTP"]);

describe("environment variable coverage", () => {
  const keys = schemaKeys();

  it("reads the schema", () => {
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toContain("AUTH_SECRET");
  });

  const targets: Array<[string, string, (key: string) => boolean]> = [
    [".env.example", read(".env.example"), () => true],
    ["docs/CONFIGURATION.md", read("docs/CONFIGURATION.md"), () => true],
    ["docker-compose.prod.yml", read("docker-compose.prod.yml"), (key) => !NOT_IN_COMPOSE.has(key)],
    ["docker-compose.cloud.yml", read("docker-compose.cloud.yml"), (key) => !NOT_IN_COMPOSE.has(key) && !NOT_IN_CLOUD.has(key)],
  ];

  for (const [name, text, applies] of targets) {
    it(`lists every schema variable in ${name}`, () => {
      expect(keys.filter((key) => applies(key) && !mentions(text, key))).toEqual([]);
    });
  }

  it("keeps the allow-list honest", () => {
    for (const key of NOT_IN_COMPOSE) expect(keys).toContain(key);
  });
});
