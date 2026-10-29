import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("real Nodemailer composition and access restrictions", () => {
  const transporter = nodemailer.createTransport({
    streamTransport: true, buffer: true, newline: "unix",
    disableFileAccess: true, disableUrlAccess: true,
  });
  const envelope = {
    from: "Space Works <noreply@example.test>", to: "Member <member@example.test>",
    subject: "Your membership", messageId: "<stable-outbox@example.test>",
  };
  let directory: string;
  let file: string;
  let url: string;
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end("disposable URL fixture");
  });

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "swe-mail-test-"));
    file = join(directory, "message.txt");
    await writeFile(file, "Subject: fixture\r\n\r\ndisposable file fixture");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    url = `http://127.0.0.1:${address.port}/fixture`;
  });

  afterAll(async () => {
    transporter.close();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("composes text, HTML and a PDF attachment without SMTP", async () => {
    const pdf = Buffer.from("%PDF-1.7\n%%EOF\n");
    const result = await transporter.sendMail({
      ...envelope, text: "Membership details", html: "<p>Membership details</p>",
      attachments: [{ filename: "card.pdf", content: pdf, contentType: "application/pdf" }],
    });
    const message = result.message.toString();
    expect(result.messageId).toBe(envelope.messageId);
    expect(result.envelope).toEqual({ from: "noreply@example.test", to: ["member@example.test"] });
    expect(message).toContain("Subject: Your membership");
    expect(message).toContain("Message-ID: <stable-outbox@example.test>");
    expect(message).toContain("Content-Type: text/plain");
    expect(message).toContain("Content-Type: text/html");
    expect(message).toContain("<p>Membership details</p>");
    expect(message).toContain("Content-Type: application/pdf");
    expect(message).toContain("filename=card.pdf");
    expect(message.replace(/\r?\n/g, "")).toContain(pdf.toString("base64"));
  });

  it.each(["attachment", "raw"] as const)("rejects file-backed %s content despite message-level overrides", async kind => {
    const content = kind === "raw" ? { raw: { path: file } } : { attachments: [{ path: file }] };
    await expect(transporter.sendMail({ ...envelope, text: "Safe text", ...content, disableFileAccess: false }))
      .rejects.toThrow(/File access rejected/);
  });

  it.each(["attachment", "raw"] as const)("rejects URL-backed %s content without making a request", async kind => {
    const before = requests;
    const content = kind === "raw" ? { raw: { href: url } } : { attachments: [{ href: url }] };
    // Deliberately malformed `raw` input: the type cast keeps the runtime rejection under test.
    await expect(transporter.sendMail({ ...envelope, text: "Safe text", ...content, disableUrlAccess: false } as unknown as Parameters<typeof transporter.sendMail>[0]))
      .rejects.toThrow(/Url access rejected/);
    expect(requests).toBe(before);
  });
});
