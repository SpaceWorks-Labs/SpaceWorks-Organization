// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newSection, SECTION_TYPES, type PageDocument, type PageSection } from "@/lib/publicPage/sections";

const actions = vi.hoisted(() => ({
  savePublicPageDraft: vi.fn(async () => ({ ok: true, data: { revision: "r2", savedAt: new Date().toISOString() } })),
  publishPublicPage: vi.fn(async () => ({ ok: true })),
  discardPublicPageDraft: vi.fn(async () => ({ ok: true })),
  unpublishPublicPage: vi.fn(async () => ({ ok: true })),
  listPublicPageVersions: vi.fn(async () => ({ ok: true, data: { versions: [] } })),
  previewPublicPageVersion: vi.fn(),
  restorePublicPageVersion: vi.fn(),
  uploadPublicPageImage: vi.fn(),
  uploadPublicPageFile: vi.fn(),
}));
vi.mock("@/app/actions/public-page", () => actions);

const { ToastProvider } = await import("@/components/feedback/ToastProvider");
const { VisualEditor } = await import("@/components/settings/public-page/editor/VisualEditor");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = { name: "Kochi Makers", slug: "kochi-makers", kind: "Makerspace", logoUrl: null, locale: "en-IN", financialYearStartMonth: 4, unitLevels: ["Area"], description: "We make things.", accentColor: null, status: "ACTIVE", timezone: "Asia/Kolkata", contactEmail: "hello@example.org", contactPhone: null };
const EXTRAS = { areas: [], groupings: [], statsCatalogue: [{ kind: "total" as const, label: "Total members", value: 42, percent: null, rows: [] }], unitLevels: ["Area"], pageImages: [] };

let root: Root;
let host: HTMLDivElement;

function mount(document: PageDocument) {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(ToastProvider, null, createElement(VisualEditor, {
      org: ORG, initial: document, published: null, publishedLabel: null, hasDraft: false, canEdit: true,
      plans: [], units: [], counts: null, sampleCard: null, extras: EXTRAS,
    })));
  });
}

const button = (name: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.getAttribute("aria-label") === name || one.textContent?.trim() === name);
  if (!found) throw new Error(`No button "${name}"`);
  return found;
};
const click = (element: HTMLElement) => act(() => { element.click(); });
const frames = () => [...host.querySelectorAll<HTMLElement>("[data-frame-index]")].map((frame) => frame.id.replace("frame-", ""));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  Object.values(actions).forEach((fn) => fn.mockClear());
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("public page visual editor", () => {
  it("draws every block type on the canvas without breaking", () => {
    mount({ tagline: "", coverAssetKey: null, accentColor: null, sections: SECTION_TYPES.filter((type) => type !== "hero").map((type, i) => newSection(type, `sect${String(i).padStart(4, "0")}`)) });
    expect(frames()).toHaveLength(SECTION_TYPES.length - 1);
    expect(host.textContent).toContain("Total members");
  });

  it("adds a block after the selected section, moves it, undoes and autosaves", async () => {
    mount({ tagline: "", coverAssetKey: null, accentColor: null, sections: [newSection("about", "about00001"), newSection("plans", "plans00001")] });
    // Select the first section from the outline, then add a divider after it.
    click([...host.querySelectorAll<HTMLButtonElement>("aside ol button")].find((one) => one.textContent?.startsWith("About us"))!);
    expect(host.querySelector("#editor-panel-title")?.textContent).toBe("About us");
    click(button("Add block"));
    expect(host.textContent).toContain("Layout and design");
    click([...host.querySelectorAll<HTMLButtonElement>("aside button")].find((one) => one.textContent?.startsWith("Divider"))!);
    const added = frames()[1]!;
    expect(frames()).toEqual(["about00001", added, "plans00001"]);
    expect(host.querySelector("#editor-panel-title")?.textContent).toBe("Divider");

    click(button("Move Divider down"));
    expect(frames()).toEqual(["about00001", "plans00001", added]);
    expect(host.querySelector("[role=status][aria-live=polite]")?.textContent).toContain("moved to position 3 of 3");

    click(button("Undo"));
    expect(frames()).toEqual(["about00001", added, "plans00001"]);

    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(actions.savePublicPageDraft).toHaveBeenCalledTimes(1);
    const saved = (actions.savePublicPageDraft.mock.calls[0] as unknown as [{ document: PageDocument }])[0].document;
    expect(saved.sections.map((section) => section.type)).toEqual(["about", "divider", "plans"]);
  });

  it("hides a section and asks before deleting one with content", () => {
    mount({ tagline: "", coverAssetKey: null, accentColor: null, sections: [{ ...newSection("text", "text000001"), body: "Hello there" } as PageSection] });
    click(button("Hide Free text"));
    expect(host.textContent).toContain("Hidden from visitors");
    click(button("Delete Free text"));
    expect(window.document.body.textContent).toContain("Delete Free text?");
    expect(frames()).toEqual(["text000001"]);
  });
});
