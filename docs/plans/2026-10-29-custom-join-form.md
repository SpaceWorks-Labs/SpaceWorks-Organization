# Custom join form (0.8.1)

Owner request (2026-10-29): "make the join form complete custom", including a photo. Organisation search,
the join modes (open, request and acceptance, invite only, closed) and the pay/free flows already exist and are
unchanged. Revised after two Codex plan reviews.

## What changes

1. **Photo on the join form, per plan.** `MembershipPlan.joinPhoto` text column: `OFF` (default) | `OPTIONAL` |
   `REQUIRED`. `submitJoin` takes `FormData` (`payload` JSON plus optional `photo`).
   - Server policy: a file is refused when `OFF`. The member is resolved only from organisation + the account's
     verified email inside the transaction (never a submitted id, key or URL). An existing member who already has a
     photo keeps it, whatever is uploaded (so joining another plan never bypasses `memberPhotoUpload=false`);
     `REQUIRED` is met by an existing photo.
   - Before the join transaction: rate limit, then validate the file fully (type signature, size, dimensions and a
     successful decode, with the code `replaceMemberPhoto` uses, factored out as `prepareMemberPhoto`). A bad image
     refuses the join with a field error and writes nothing.
   - After commit, the photo is attached under a lock, and anything left over is swept. No new outbox kind is added,
     so rollback is unaffected:
     1. **Every photo write locks and re-reads.** `replaceMemberPhoto` (used by staff uploads, member self-upload and
        now joins) locks the member row (`SELECT … FOR UPDATE`) and re-reads `photoUrl` and `anonymisedAt` in the
        transaction that attaches the new photo, instead of trusting the caller's copy. It never writes to an
        anonymised member. A join attaches only when the re-read photo is empty (`onlyIfEmpty`); otherwise the new
        upload is deleted at once, best effort.
     2. **A daily sweep cleans up the rest.** `member-photo-sweep` is a new entry in `lib/queue/registry.ts` and the
        in-process scheduler. It lists objects under `organisations/<org>/members/`. It deletes, with every version,
        any object more than 24 hours old that isn't its member's current `photoUrl` (with its Asset row, if any), and
        everything under the prefix of a member who no longer exists or is anonymised.

     That covers a displaced or unreferenced photo, a failed best-effort delete, a crash between upload and attach,
     and an upload that lands after an erasure's purge. The 24-hour age means it can't race an upload or an attach
     in progress. Nothing outside a member's prefix is touched, and the previous release simply doesn't run the
     sweep. The photo is audited like other photo changes.

     An operational failure returns join success with a separate warning. That warning suggests adding the photo
     later from the account only when the organisation has member accounts and member photo upload on; otherwise it
     asks the member to contact the organisation.
2. **Built-in fields per plan.** `MembershipPlan.joinFields` JSON (zod-validated, defaults equal today's form):
   `phone`, `state`: `HIDDEN` | `OPTIONAL` | `REQUIRED` (default `OPTIONAL`); `minors`: boolean (default `true`).
   They govern joining only. A hidden field's submitted value is ignored and the member's existing value is kept
   (upsertMember stops nulling omitted phone/state).
   - Minors: the effective minor status is the existing member's stored `isMinor` when there is one, else the
     submitted value when `minors` is on, else false. When it is true the form shows the guardian fields and the
     guardian consent statement ("I am the parent or guardian and agree…"), even with `minors` off (the join view
     knows the existing member); the server requires the guardian's name and email and the guardian consent
     checkbox, and writes `consentRecord.byGuardian = true`. When false, guardian fields are ignored and
     `byGuardian = false`. `byGuardian` is derived from the resolved member and the validated consent, never from
     the raw payload. Turning `minors` off never resets an existing minor or their guardian details.
3. **More question shapes, rollback-safe: no enum change and no new answer type.** A multi-select question is stored
   as type `LONG_TEXT` with `PlanField.multiple = true` and its `options`. Its answer is one string, the chosen
   options in option order joined with "; ", at most 2,000 characters (the existing long-text limit). The previous
   release ignores `multiple` and `options` on a long-text question, so it shows, validates and saves the answer as
   plain text. The new release accepts only listed options; options of a multiple question may not contain ";".
   `PlanField.section` is a heading with help text, stored as type `TEXT`; it is never required, never answered,
   never printed and never exported. The previous release shows it as an optional text question: degraded but
   working, so update rollbacks stay supported. Existing answers are untouched. Turning a single select into a
   multi-select reads the old answer as a one-item list, and unknown parts of a stored list are dropped on the next
   save.
4. **Conditional questions.** `PlanField.showIfKey` + `showIfValue` (both set or both null). Saving refuses:
   - references to a later, the same or a missing question;
   - a parent that isn't a select or a checkbox;
   - a value not among the parent's options (`"true"` for a checkbox);
   - a public question depending on an admin-only one;
   - dangling conditions after deletion, reorder or type change.

   Server definitions are always loaded ordered by `sortOrder`. `validateFieldValues` decides visibility from
   validated, visible parent answers only (never the raw payload); hidden questions are not required and their
   answers are dropped.
5. **Answers are replaced per plan, and keys are safe across plans.** Every writer of `Member.fieldValues`
   locks the member row (`SELECT … FOR UPDATE`) in its transaction before reading and replacing answers. That covers
   join (`upsertMember`), staff add and edit, the portal profile and import, so concurrent saves for different
   plans never overwrite each other's keys. Saving one plan's answers (join, staff add
   and edit, portal profile, import) sets or clears exactly the keys of that plan's questions the actor may answer
   (public ones, plus admin-only ones for staff), clearing hidden and emptied ones, and preserves every other key.
   - Keys live on the member, so saving a plan's questions refuses a key another plan of the organisation uses
     with a different shape or admin-only setting ("Another plan uses this key differently").
   - Question saves are serialised per organisation: the check and the write run in one transaction that first
     takes `SELECT … FOR NO KEY UPDATE` on the organisation row, as structure edits do, so two concurrent saves
     can't both pass conflicting checks.
   - Existing collisions are made safe at runtime by one function, `answerableKeys(organisationId, actor)`, used by
     every read and write path. A key that is admin-only on any plan is admin-only everywhere: it is never shown on,
     prefilled into or written from a public form or the portal. A key whose shapes disagree across plans is not
     written from public forms or the portal until resolved. The editor lists such keys.
6. **Profile editing works on one answer per key.** Staff edit and the portal profile show the union of the
   questions of the member's plans, one per key: shared keys have the same shape and admin-only setting by rule 5,
   while conditions may differ by plan. A question is visible if any plan's definition of it is visible, evaluated
   on the merged answers in the form. It is required if it is required under any definition that is visible. Each
   key is validated and written once, and the replace rule applies to the union of answerable keys. Visibility is
   resolved in plan order, then question order, iterating until stable so a shared parent in one plan can show a
   dependent question in another. The server recomputes all of this from validated answers.
7. **Every place answers are read or written:**
   - `app/actions/join.ts`;
   - `app/actions/members.ts` (add and edit) and their loaders;
   - `app/actions/portal.ts` with `PortalProfileForm.tsx` and its loader;
   - `lib/membership/importMapping.ts`, `lib/membership/importRows.ts` and `app/actions/member-import.ts`. Preview
     and commit validate with the same definitions, and multi-select cells are split on `;` only (commas may appear inside options), with a round-trip test;
   - the member page display;
   - `app/api/exports/members`;
   - `memberDetails` for cards (lists shown with `, `; sections skipped).

   Answer types stay `string | number | boolean`.

Migration `0021_custom_join_form` (additive, with defaults, no enum change):
- `MembershipPlan.joinPhoto TEXT NOT NULL DEFAULT 'OFF'`, with a check constraint;
- `MembershipPlan.joinFields JSONB NOT NULL DEFAULT '{}'`;
- `PlanField.multiple BOOLEAN NOT NULL DEFAULT false`;
- `PlanField.section BOOLEAN NOT NULL DEFAULT false`;
- `PlanField.showIfKey TEXT` and `PlanField.showIfValue TEXT`, with a both-or-neither check.

## Out of scope

Report exports don't read custom answers, and the staff scan panel reuses the member page loaders, so neither
needs changes.

## Tests

- **Unit tests:**
  - visibility: chains, hidden parents, crafted hidden answers dropped;
  - multi-select: duplicates, invalid options, empty, wrong types, ";" refused in options, round trip through the
    stored string;
  - sections;
  - condition checks on save;
  - collision rules and `answerableKeys`;
  - per-plan replacement: clears hidden and emptied keys, keeps other plans' and admin-only keys;
  - `joinFields` enforcement, `memberDetails`, and import splitting on `;` only, round-tripping an option that contains a comma.
- **Integration tests:**
  - **Photo:**
    - a required photo that is missing is refused;
    - a malformed image is refused before any membership is written;
    - a valid photo is stored under the joining member's own prefix and audited;
    - `OFF` refuses a file;
    - an existing photo is never replaced through joining;
    - a crafted member id or key is ignored;
  - a rejected upload is deleted at once, or by the sweep if that delete fails;
    - a post-commit storage failure returns success with a warning;
    - concurrent photo writes keep the existing photo and delete the unused object, for two joins, a join against a
      staff upload, and a join against an erasure, with nothing written after anonymisation.
  - **Built-in fields and consent:**
    - hidden phone and state keep their existing values;
    - for an existing minor with minors off, guardian consent is required and `byGuardian` is true.
  - **Questions and answers:**
    - a conditional question is required only when shown;
    - a public form can't read or write an admin-only-anywhere key, and shape-conflicting keys aren't written
      publicly;
    - two concurrent question saves can't create a collision;
    - two concurrent saves of different plans' answers for one member both keep their keys;
  - a staff upload prepared before a join attaches, saved after it: the member keeps exactly one current photo, and
    the sweep removes the other object;
  - the sweep deletes unreferenced objects older than 24 hours and objects of anonymised members, and keeps current
    photos, recent uploads and everything outside member prefixes;
  - staff and portal editing across two plans: a shared parent in one plan shows a dependent question in the other,
    each key is written once, and another plan's answers are kept;
    - import preview and commit agree;
    - export and card output.
  - **Rollback:** a member with a stored multi-select answer ("A; B" on a long-text question) is validated and
    saved by the 0.8.0 field validator (a fixture copy of 0.8.0's `validateFieldValues`), and the 0.8.0 Prisma
    models read the new columns.
- **Gates:** lint, typecheck, unit, integration, build, frontend catalog and file length.

## Files

- **Schema and migration:** `prisma/schema.prisma`, `prisma/migrations/0021_custom_join_form/migration.sql`.
- **Validation:** `lib/membership/validators.ts`, split into `lib/membership/joinFields.ts` and
  `lib/membership/planAnswers.ts` (visibility, per-plan replacement, `answerableKeys`) to stay under 300 lines.
- **Photo:** `lib/membership/photo.ts` (`prepareMemberPhoto`, locked re-read, `onlyIfEmpty`),
  `lib/storage/memberPhotos.ts` (the sweep) and `lib/queue/registry.ts` (`member-photo-sweep`).
- **Actions:** `app/actions/join.ts`, `app/actions/plans.ts`, `app/actions/members.ts`, `app/actions/portal.ts`
  and `app/actions/member-import.ts`, plus the import helpers.
- **Components:** `components/public/JoinForm.tsx` (split), `components/plans/PlanFieldsEditor.tsx`, the plan
  settings form, the member edit form and `PortalProfileForm.tsx`.
- **Views:** the join, member and portal profile loaders.
- **Elsewhere:** `lib/cards/core.ts` and `app/api/exports/members`.
- **Docs:** CLAUDE.md and AGENTS.md (identical), CHANGELOG (0.8.1), README.
