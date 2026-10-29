import { describe, expect, it } from "vitest";
import { renderBrandedEmail } from "@/lib/email/message";
import { fillPlaceholders, paragraphsOf, renderEmailTemplate, sampleValues, STANDARD_TEMPLATES, templateProblem } from "@/lib/email/templates";

const values = { name: "Asha Menon", organisation: "Example Network", plan: "Annual", unit: "North 1", cardNumber: "EXN-0042", validUntil: "31 Mar 2027" };

describe("email template placeholders", () => {
  it("fills every known placeholder", () => {
    expect(fillPlaceholders("{name} of {unit}, {organisation}: {plan} card {cardNumber} until {validUntil}", values)).toBe(
      "Asha Menon of North 1, Example Network: Annual card EXN-0042 until 31 Mar 2027",
    );
  });

  it("leaves unknown placeholders as typed and empties known ones without a value", () => {
    expect(fillPlaceholders("Hi {name}, {nickname} {Name} {} {unit}.", { name: "Asha", unit: null })).toBe("Hi Asha, {nickname} {Name} {} .");
  });

  it("never treats a filled value as a placeholder again", () => {
    expect(fillPlaceholders("Hi {name}", { name: "{organisation}", organisation: "Example Network" })).toBe("Hi {organisation}");
  });
});

describe("email template rendering", () => {
  it("splits the body into paragraphs on blank lines, keeping single line breaks", () => {
    expect(paragraphsOf("First line\nsame paragraph\n\n\n  Second  \r\n\r\nThird\n \n")).toEqual(["First line\nsame paragraph", "Second", "Third"]);
  });

  it("keeps the subject and heading to one line", () => {
    const rendered = renderEmailTemplate({ subject: "Card for\n{name}", heading: "  Welcome,\t{name} ", body: "Body" }, values);
    expect(rendered).toEqual({ subject: "Card for Asha Menon", heading: "Welcome, Asha Menon", paragraphs: ["Body"] });
  });

  it("escapes what members and editors typed when the email is built, so it is never HTML", () => {
    const rendered = renderEmailTemplate({ subject: "Hi", heading: "<b>Welcome</b>", body: "<script>alert(1)</script> {name}\n\n<a href=\"https://example.test\">x</a>" }, { name: "Asha <img src=x onerror=alert(1)>" });
    const { html, text } = renderBrandedEmail(rendered);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<a href=\"https://example.test\"");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Asha &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;b&gt;Welcome&lt;/b&gt;");
    expect(text).toContain("<script>alert(1)</script> Asha");
  });

  it("starts from the standard wording, which renders with the sample details", () => {
    const rendered = renderEmailTemplate(STANDARD_TEMPLATES["card-issued"], sampleValues("Example Network"));
    expect(rendered.subject).toBe("Your Example Network membership card");
    expect(rendered.paragraphs).toHaveLength(2);
    expect(rendered.paragraphs[0]).toContain("Hi Asha Menon, your Annual membership card from Example Network");
    expect(renderEmailTemplate(STANDARD_TEMPLATES["membership-activated"], values).paragraphs).toEqual(["Hi Asha Menon, your Annual membership with Example Network is active until 31 Mar 2027."]);
  });

  it("refuses empty or overlong parts", () => {
    expect(templateProblem({ subject: "S", heading: "H", body: "B" })).toBeNull();
    expect(templateProblem({ subject: " ", heading: "H", body: "B" })).toMatch(/subject/);
    expect(templateProblem({ subject: "S", heading: "H".repeat(151), body: "B" })).toMatch(/150/);
    expect(templateProblem({ subject: "S", heading: "H", body: "B".repeat(5001) })).toMatch(/5000/);
  });
});
