import crypto from "node:crypto";

const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data, "utf8").digest();
const sha256 = (data: crypto.BinaryLike) => crypto.createHash("sha256").update(data).digest("hex");

export type SigV4Input = {
  method: string;
  host: string;
  path: string;
  query?: string;
  /** Extra headers to sign (lower-case names). `host` and `x-amz-date` are added. */
  headers?: Record<string, string>;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
};

/** AWS Signature Version 4 for one request. Returns the headers to send (without `host`), `authorization` included. */
export function signV4(input: SigV4Input): Record<string, string> {
  const amzDate = (input.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...input.headers, host: input.host, "x-amz-date": amzDate };
  if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonical = [input.method, input.path, input.query ?? "", canonicalHeaders, signedHeaders, sha256(input.body)].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  const { host, ...rest } = headers;
  void host;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}
