import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handler: vi.fn(async () => new Response("handled")) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queue/inline", () => ({ runDueJobsInline: vi.fn() }));
vi.mock("inngest/next", () => ({ serve: () => ({ GET: mocks.handler, POST: mocks.handler, PUT: mocks.handler }) }));

import { NextRequest } from "next/server";
import { GET, POST, PUT } from "@/app/api/inngest/route";
import { inngestEnabled } from "@/lib/queue/inngest";

const saved = { key: process.env.INNGEST_SIGNING_KEY, dev: process.env.INNGEST_DEV, env: process.env.NODE_ENV };
const request = () => new NextRequest("https://members.test/api/inngest", { method: "POST" });
const restore = (name: string, value: string | undefined) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };

afterEach(() => {
  vi.clearAllMocks();
  restore("INNGEST_SIGNING_KEY", saved.key);
  restore("INNGEST_DEV", saved.dev);
  vi.unstubAllEnvs();
});

describe("/api/inngest", () => {
  it("does not exist until Inngest is configured", async () => {
    delete process.env.INNGEST_SIGNING_KEY;
    delete process.env.INNGEST_DEV;
    for (const method of [GET, POST, PUT]) expect((await method(request(), {})).status).toBe(404);
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("hands every call to the SDK, which verifies the signature, once the signing key is set", async () => {
    process.env.INNGEST_SIGNING_KEY = "signkey-test-0123456789";
    expect(await (await POST(request(), {})).text()).toBe("handled");
    expect(mocks.handler).toHaveBeenCalledOnce();
  });

  it("allows the local dev server without a key, never in production", () => {
    delete process.env.INNGEST_SIGNING_KEY;
    process.env.INNGEST_DEV = "1";
    vi.stubEnv("NODE_ENV", "development");
    expect(inngestEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(inngestEnabled()).toBe(false);
  });
});
