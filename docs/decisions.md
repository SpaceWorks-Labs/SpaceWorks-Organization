# Decisions

Short records of choices that are hard to reverse or easy to forget the reason for. Newest last.

## 2026-11-19: SAML 2.0 library

**Context.** Product rules section 15 asks every product with accounts to offer SAML 2.0 sign-in, using a
maintained library, and to record which one and why. Auth.js (next-auth 5.0.0-beta.32, already used for the other
methods) has no SAML provider.

**Decision.** Use `@node-saml/node-saml` 5.2.0 (pinned exactly), MIT licensed, last published 2026-10-26, with a
current major version and an active release history. It is the maintained successor of the library behind
passport-saml, runs on Node 18 and later, and its dependencies (`xml-crypto`, `@xmldom/xmldom`, `xml2js`, `xpath`)
are the standard XML signature stack. It validates the signature, issuer, audience, `NotBefore` and `NotOnOrAfter`,
and `InResponseTo` through a cache provider we back with the database (single use, 10 minutes), and can reject
replayed assertions. We add the checks it only warns about: the bearer `Recipient` must be our response address.
Only the service-provider side is used (HTTP-Redirect requests, HTTP-POST responses); no logout or encryption.
Auth.js itself was re-checked for this release: it is MIT licensed and still the supported way to sign in with
Google, Apple, GitHub and generic OpenID Connect, but it is still a beta release line, so it stays pinned.

**Consequences.**
- SAML is a route pair (`/api/auth/saml/<name>/login` and `/acs`) plus a one-time ticket handed to an Auth.js
  Credentials provider, because Auth.js cannot run SAML itself. The ticket is random, stored as a hash, valid two
  minutes and single use.
- Responses must be signed (the assertion, by default) and answer a request we made; identity provider initiated
  sign-in is refused.
- A SAML identity never links to an existing account by email. Upgrading the library means re-running the response
  tests in `tests/unit/saml-response.test.ts`, which sign responses with a locally generated key.
- The website's proxy lets the one cross-site POST to the response address through; every other proxied POST still
  needs the site's own origin.

## 2026-11-19: Passkey (WebAuthn) library

**Context.** Product rules section 15 offers passkeys as a sign-in method (off by default, phishing-resistant, user
verification required) and asks for a maintained library, with the choice recorded. WebAuthn attestation and
assertion parsing (CBOR, COSE keys, authenticator data, signatures) is not something to write by hand.

**Decision.** Use `@simplewebauthn/server` 14.1.0 and `@simplewebauthn/browser` 14.0.0 (pinned exactly), both MIT
licensed. The server package was last published 2026-11-06 and the browser package 2026-09-02, both on a current
major version, from one actively released project. The server package needs Node 22 or later (this app already
does) and depends on the `@peculiar` ASN.1 packages and a small CBOR reader. It is the library behind most
open-source WebAuthn relying parties, validates the challenge, origin, relying party id, user presence and user
verification flags and the signature, and has typed JSON shapes that match what the browser package serialises.

**Consequences.**
- Passkeys are a Credentials provider (`passkey`) on top of server actions that issue the options; Auth.js has no
  WebAuthn flow that fits discoverable sign-in without an email. The challenge is stored in the database
  (`PasskeyChallenge`), single use and valid five minutes, and the sign-in one is named by an opaque cookie.
- We call the library with attestation `none` and user verification required. Its counter rule is switched off in the
  call (passing a stored counter of 0) so the check can run in our code, which refuses a counter that stands still or
  goes back when either side counts and writes an audit row; many synced passkeys always report 0, which is accepted.
- No metadata service is initialised, so there is no authenticator allow-list and no outbound request: WebAuthn needs
  no change to the content security policy.
- Tests use a software authenticator (`tests/helpers/softPasskey.ts`) that builds real attestations and assertions
  with an ES256 key, so the library's checks run for real. Upgrading the library means re-running
  `tests/unit/passkey-verify.test.ts`.

## 2026-11-19: WhatsApp as a member channel, pending a design-system decision

**Context.** Product rules section 16 lists chat destinations (Slack, Discord, Mattermost, Telegram, a signed webhook) and
text messages (Twilio, MSG91), and says a new provider is added there, with a decision, before any product uses it. It does not
list WhatsApp. Release 0.10.0 sends member reminders on WhatsApp, as SpaceWorks does, and the owner asked for it.

**Decision.** Ship WhatsApp for members through two providers: a Twilio WhatsApp sender, and the Meta WhatsApp Cloud API. Both
send approved templates only (no session-window replies), verify their webhooks (Twilio by `X-Twilio-Signature`, Meta by
`X-Hub-Signature-256` with the app secret) and keep their secrets encrypted and write-only. This stays a decision of this
repository until the design system lists WhatsApp; the design-system repository has not been changed.

**Consequences.**
- The design system needs a matching entry in section 16 (providers, what they carry, the template rule) so the other products
  can reuse it; until then WhatsApp here is documented only in `docs/NOTIFICATIONS.md`.
- A member's WhatsApp number is verified with the text-message code path, so linking needs a text-message provider.
- Telegram, Slack, Discord and Mattermost, already in section 16 as team chat destinations, are also member channels now:
  direct messages from a bot, linked by a one-time code.
