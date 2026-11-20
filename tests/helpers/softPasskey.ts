import crypto from "node:crypto";

/**
 * A software WebAuthn authenticator for tests: an ES256 key pair that builds real "none" attestation and assertion
 * responses, so @simplewebauthn/server verifies genuine signatures and the checks (origin, relying party id, user
 * verification, counter) are exercised rather than mocked.
 */
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (value: string | Uint8Array) => crypto.createHash("sha256").update(value).digest();

function cborHead(major: number, length: number) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff]);
}
const cborText = (text: string) => Buffer.concat([cborHead(3, text.length), Buffer.from(text)]);
const cborBytes = (bytes: Uint8Array) => Buffer.concat([cborHead(2, bytes.length), bytes]);

export type Ceremony = { rpID: string; origin: string; challenge: string; uv?: boolean; counter?: number; clientOrigin?: string; rpIDForHash?: string };

export class SoftPasskey {
  readonly credentialId = crypto.randomBytes(16);
  private readonly keys = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  /** The credential id as the browser reports it (base64url). */
  get id() { return b64(this.credentialId); }

  private cose() {
    const jwk = this.keys.publicKey.export({ format: "jwk" });
    return Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), Buffer.from(jwk.x!, "base64url"), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y!, "base64url")]);
  }

  private authData(options: Ceremony, attested: boolean) {
    const flags = 0x01 | (options.uv === false ? 0 : 0x04) | (attested ? 0x40 : 0);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(options.counter ?? 0);
    const head = Buffer.concat([sha256(options.rpIDForHash ?? options.rpID), Buffer.from([flags]), counter]);
    if (!attested) return head;
    const length = Buffer.alloc(2);
    length.writeUInt16BE(this.credentialId.length);
    return Buffer.concat([head, Buffer.alloc(16), length, this.credentialId, this.cose()]);
  }

  private clientData(type: string, options: Ceremony) {
    return Buffer.from(JSON.stringify({ type, challenge: options.challenge, origin: options.clientOrigin ?? options.origin, crossOrigin: false }));
  }

  /** What navigator.credentials.create returns (as @simplewebauthn/browser serialises it). */
  register(options: Ceremony) {
    const attestation = Buffer.concat([Buffer.from([0xa3]), cborText("fmt"), cborText("none"), cborText("attStmt"), Buffer.from([0xa0]), cborText("authData"), cborBytes(this.authData(options, true))]);
    return {
      id: this.id, rawId: this.id, type: "public-key" as const, clientExtensionResults: {}, authenticatorAttachment: "platform" as const,
      response: { clientDataJSON: b64(this.clientData("webauthn.create", options)), attestationObject: b64(attestation), transports: ["internal"] },
    };
  }

  /** What navigator.credentials.get returns. `forgeWith` signs with a different key, to model a forged assertion. */
  assert(options: Ceremony, forgeWith?: SoftPasskey) {
    const authData = this.authData(options, false);
    const clientData = this.clientData("webauthn.get", options);
    const signer = (forgeWith ?? this).keys.privateKey;
    const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(clientData)]), signer);
    return {
      id: this.id, rawId: this.id, type: "public-key" as const, clientExtensionResults: {}, authenticatorAttachment: "platform" as const,
      response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData), signature: b64(signature) },
    };
  }

  /** The stored public key, as the server keeps it (COSE bytes). */
  get publicKey() { return this.cose(); }
}
