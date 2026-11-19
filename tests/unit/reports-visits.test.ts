import { describe, expect, it } from "vitest";
import { eachDay, routeLabel, summariseVisits } from "@/lib/reports/visits";

describe("web visits aggregation", () => {
  const rows = [
    { day: "2026-11-01", route: "/o/:orgSlug", count: 4 },
    { day: "2026-11-01", route: "/o/:orgSlug/join/:planSlug", count: 1 },
    { day: "2026-11-03", route: "/o/:orgSlug", count: 6 },
    { day: "2026-10-31", route: "/", count: 99 },
    { day: "2026-11-02", route: "/privacy", count: 0 },
  ];

  it("totals only rows inside the range and ignores empty counts", () => {
    const summary = summariseVisits(rows, "2026-11-01", "2026-11-03");
    expect(summary.total).toBe(11);
    expect(summary.byRoute.map((row) => [row.route, row.count])).toEqual([["/o/:orgSlug", 10], ["/o/:orgSlug/join/:planSlug", 1]]);
    expect(summary.byRoute[0].share).toBeCloseTo(10 / 11);
  });

  it("gives the trend a point for every day, with zeros for quiet days", () => {
    const summary = summariseVisits(rows, "2026-11-01", "2026-11-03");
    expect(summary.unit).toBe("day");
    expect(summary.trend.map((point) => [point.label, point.count])).toEqual([["1 Nov", 5], ["2 Nov", 0], ["3 Nov", 6]]);
  });

  it("groups long periods by month", () => {
    const summary = summariseVisits([{ day: "2026-01-15", route: "/", count: 2 }, { day: "2026-03-02", route: "/", count: 3 }], "2026-01-01", "2026-04-30");
    expect(summary.unit).toBe("month");
    expect(summary.trend.map((point) => [point.label, point.count])).toEqual([["Jan 2026", 2], ["Feb 2026", 0], ["Mar 2026", 3], ["Apr 2026", 0]]);
  });

  it("is empty and safe for reversed, invalid or enormous ranges", () => {
    expect(eachDay("2026-11-03", "2026-11-01")).toEqual([]);
    expect(eachDay("nope", "2026-11-01")).toEqual([]);
    expect(eachDay("2000-01-01", "2026-11-01")).toEqual([]);
    expect(summariseVisits(rows, "2026-11-03", "2026-11-01")).toMatchObject({ total: 0, trend: [], byRoute: [] });
  });

  it("names known templates and falls back to the template itself", () => {
    expect(routeLabel("/o/:orgSlug")).toBe("Public page");
    expect(routeLabel("/o/:orgSlug/join/:planSlug")).toBe("Join form");
    expect(routeLabel("/unknown")).toBe("/unknown");
  });
});
