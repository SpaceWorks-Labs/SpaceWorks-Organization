#!/usr/bin/env node
// Two years of membership history for the SpaceWorks sample organisation, so every report has data.
//
//   DEMO_PASSWORD=<12+ chars> npm run db:seed-demo && DEMO_PASSWORD=<same> npm run db:seed-reports
//
// Adds units, three plans (one in USD), member roles, ~280 sample members with term chains and status
// events (joins, approvals, renewals early and late, grace, lapses, comebacks, revocations, pending
// applications), a Viewer and a unit-scoped Manager. Deterministic. Refuses to run twice or in production.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("seed-reports never runs in production.");
const password = process.env.DEMO_PASSWORD ?? "";
if (password.length < 12) throw new Error("Set DEMO_PASSWORD (at least 12 characters).");

const prisma = new PrismaClient();
const org = await prisma.organisation.findUnique({ where: { slug: "spaceworks" } });
if (!org) throw new Error("Run npm run db:seed-demo first (it creates the SpaceWorks organisation).");
if (await prisma.membershipPlan.findFirst({ where: { organisationId: org.id, slug: "annual" } })) {
  console.log("seed-reports: already seeded.");
  process.exit(0);
}

let seed = 20261020;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const DAY = 86_400_000;
const now = new Date();
const IST = 330 * 60_000;
/** 00:00 IST on the day containing `instant`. */
const dayStart = (instant) => new Date(Math.floor((instant.getTime() + IST) / DAY) * DAY - IST);
const addMonths = (instant, months) => {
  const local = new Date(instant.getTime() + IST);
  const shifted = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + months, Math.min(local.getUTCDate(), 28));
  return new Date(shifted - IST);
};
/** End of the financial year (1 April 00:00 IST) after `instant`. */
const fyEnd = (instant) => {
  const local = new Date(instant.getTime() + IST);
  const year = local.getUTCMonth() >= 3 ? local.getUTCFullYear() + 1 : local.getUTCFullYear();
  return new Date(Date.UTC(year, 3, 1) - IST);
};

await prisma.organisation.update({ where: { id: org.id }, data: { createdAt: new Date(now.getTime() - 760 * DAY), unitLevels: ["Region", "Chapter"] } });

// Units: two regions with chapters.
const unit = async (name, slug, code, parent) => {
  const created = await prisma.orgUnit.create({ data: { organisationId: org.id, name, slug, code, parentId: parent?.id ?? null, level: parent ? 1 : 0, path: "pending" } });
  return prisma.orgUnit.update({ where: { id: created.id }, data: { path: parent ? `${parent.path}/${created.id}` : created.id } });
};
const north = await unit("North Kerala", "north-kerala", "NKL");
const south = await unit("South Kerala", "south-kerala", "SKL");
const chapters = [await unit("Kozhikode", "kozhikode", "KKD", north), await unit("Kannur", "kannur", "KNR", north), await unit("Kochi", "kochi", "COK", south), await unit("Thiruvananthapuram", "thiruvananthapuram", "TVM", south), await unit("Thrissur", "thrissur", "TCR", south)];

const plan = (data) => prisma.membershipPlan.create({ data: { organisationId: org.id, graceDays: 15, renewalWindowDays: 30, ...data } });
const annual = await plan({ name: "Annual membership", slug: "annual", currency: "INR", durationType: "ORG_YEAR", priceNewMinor: 120_000, priceRenewalMinor: 100_000, joiningFeeMinor: 50_000, joinMode: "APPROVAL", sortOrder: 0 });
const student = await plan({ name: "Student", slug: "student", currency: "INR", durationType: "ROLLING", durationMonths: 12, priceNewMinor: 30_000, priceRenewalMinor: 30_000, joinMode: "OPEN", sortOrder: 1 });
const overseas = await plan({ name: "Overseas", slug: "overseas", currency: "USD", durationType: "ROLLING", durationMonths: 12, priceNewMinor: 2_500, priceRenewalMinor: 2_500, joinMode: "APPROVAL", sortOrder: 2 });

const roleNames = [["Systems Engineer", "teal"], ["Cloud Specialist", "sky"], ["Full Stack Developer", "citron"], ["Backend Engineer", "yellow"], ["Marketing Specialist", "orange"], ["App Developer", "ink"]];
const roles = [];
for (const [index, [name, color]] of roleNames.entries()) roles.push(await prisma.memberRole.create({ data: { organisationId: org.id, name, color, sortOrder: index } }));

// Team: a Viewer and a Manager limited to the South Kerala region.
const passwordHash = await bcrypt.hash(password, 12);
// Staff need an authenticator: reuse the demo owner's (set by seed-demo from DEMO_MFA_SECRET), if there is one.
const ownerMfa = await prisma.user.findUnique({ where: { email: "owner@demo.test" }, select: { mfaSecretEncrypted: true, mfaEnabledAt: true } });
const mfa = ownerMfa?.mfaSecretEncrypted ? { mfaSecretEncrypted: ownerMfa.mfaSecretEncrypted, mfaEnabledAt: ownerMfa.mfaEnabledAt } : {};
const teamUser = (email, name) => prisma.user.upsert({ where: { email }, create: { email, name, emailVerified: now, passwordHash, ...mfa }, update: { name, emailVerified: now, passwordHash, ...mfa } });
const viewer = await teamUser("viewer@demo.test", "Ajzal P");
const regional = await teamUser("south@demo.test", "Anin Arafath");
const owner = await prisma.user.findUnique({ where: { email: "owner@demo.test" } });
// The starter roles (lib/permissionRoles.ts STARTER_ROLES), created with the organisation by seed-demo or migration 0014.
const starterRole = (name) => prisma.orgRole.findFirstOrThrow({ where: { organisationId: org.id, name }, select: { id: true } });
const viewerRole = await starterRole("Viewer");
const managerRole = await starterRole("Manager");
await prisma.teamMember.upsert({ where: { userId_organisationId: { userId: viewer.id, organisationId: org.id } }, create: { userId: viewer.id, organisationId: org.id, role: "VIEWER", roleId: viewerRole.id }, update: {} });
await prisma.teamMember.upsert({ where: { userId_organisationId: { userId: regional.id, organisationId: org.id } }, create: { userId: regional.id, organisationId: org.id, role: "ADMIN", roleId: managerRole.id, unitId: south.id }, update: { unitId: south.id } });
const managers = [owner?.id, regional.id].filter(Boolean);

const first = ["Shaan", "Abhiram", "Abdul", "Midlaj", "Ajzal", "Anin", "Fathima", "Nikhil", "Aisha", "Rahul", "Meera", "Arjun", "Sneha", "Vishnu", "Riya", "Hari", "Nandana", "Joel", "Anjali", "Faiz", "Gopika", "Adil", "Lakshmi", "Sanjay"];
const last = ["Shoukath", "NJ", "Samad", "C", "P", "Arafath", "K", "Menon", "Nair", "Thomas", "Pillai", "Varghese", "Rahman", "Krishnan", "Joseph", "Das"];
const states = ["KL", "KL", "KL", "KL", "KL", "TN", "KA", "MH", null];

const events = [];
const audits = [];
const ev = (termId, from, to, at, cause, actor = null) => events.push({ organisationId: org.id, termId, from, to, effectiveAt: at, recordedAt: at < now ? at : now, cause, actorUserId: actor });
let counter = 0;

async function term(memberId, p, start, data) {
  const end = p.durationType === "ORG_YEAR" ? fyEnd(start) : addMonths(start, 12);
  const grace = new Date(end.getTime() + 15 * DAY);
  const created = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId, planId: p.id, currency: p.currency, priceMinor: data.kind === "RENEWAL" ? p.priceRenewalMinor : p.priceNewMinor, joiningFeeMinor: data.kind === "RENEWAL" ? 0 : p.joiningFeeMinor, startsAt: start, endsAt: end, graceUntil: grace, createdAt: data.createdAt, ...data } });
  return created;
}

for (let n = 0; n < 280; n += 1) {
  const name = `${pick(first)} ${pick(last)}`;
  // Joins lean recent: the organisation grew over two years.
  const joinedAt = new Date(now.getTime() - Math.floor(Math.pow(random(), 1.6) * 720 + 3) * DAY + Math.floor(random() * DAY));
  const p = random() < 0.62 ? annual : random() < 0.78 ? student : overseas;
  const homeUnit = random() < 0.9 ? pick(chapters) : null;
  const member = await prisma.member.create({
    data: {
      organisationId: org.id, email: `member${n + 1}@spaceworks.demo.test`, name, memberNumber: (counter += 1), unitId: homeUnit?.id ?? null,
      phone: random() < 0.85 ? `+91 9${String(Math.floor(random() * 1e9)).padStart(9, "0")}` : null, stateCode: p === overseas ? null : pick(states),
      source: random() < 0.7 ? "JOIN_FORM" : random() < 0.6 ? "IMPORT" : "MANUAL", createdAt: joinedAt, isMinor: random() < 0.03,
    },
  });
  if (random() < 0.55) await prisma.memberRoleAssignment.create({ data: { organisationId: org.id, memberId: member.id, roleId: pick(roles).id, isPrimary: true } });

  const approval = p.joinMode === "APPROVAL";
  const applied = new Date(joinedAt.getTime() - (approval ? (0.2 + random() * 6) * DAY : 0));
  const actor = pick(managers);
  // Recent applicants still waiting, or declined.
  if (approval && joinedAt > new Date(now.getTime() - 12 * DAY) && random() < 0.6) {
    const pending = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: member.id, planId: p.id, status: "PENDING_APPROVAL", currency: p.currency, priceMinor: p.priceNewMinor, joiningFeeMinor: p.joiningFeeMinor, createdAt: applied } });
    ev(pending.id, null, "PENDING_APPROVAL", applied, "applied");
    continue;
  }
  if (approval && random() < 0.06) {
    const declined = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: member.id, planId: p.id, status: "REJECTED", currency: p.currency, priceMinor: p.priceNewMinor, joiningFeeMinor: p.joiningFeeMinor, createdAt: applied, decidedAt: joinedAt, decidedById: actor } });
    ev(declined.id, null, "PENDING_APPROVAL", applied, "applied");
    ev(declined.id, "PENDING_APPROVAL", "REJECTED", joinedAt, "reject", actor);
    audits.push({ action: "MEMBERSHIP_REJECT", actorUserId: actor, organisationId: org.id, targetType: "MembershipTerm", targetId: declined.id, createdAt: joinedAt });
    continue;
  }
  if (joinedAt > new Date(now.getTime() - 10 * DAY) && random() < 0.35) {
    const unpaid = await prisma.membershipTerm.create({ data: { organisationId: org.id, memberId: member.id, planId: p.id, status: "PENDING_PAYMENT", currency: p.currency, priceMinor: p.priceNewMinor, joiningFeeMinor: p.joiningFeeMinor, createdAt: applied, paymentDueBy: new Date(joinedAt.getTime() + 14 * DAY) } });
    ev(unpaid.id, null, approval ? "PENDING_APPROVAL" : "PENDING_PAYMENT", applied, "applied");
    if (approval) ev(unpaid.id, "PENDING_APPROVAL", "PENDING_PAYMENT", joinedAt, "approved", actor);
    continue;
  }

  // A chain of held terms.
  let start = dayStart(joinedAt);
  let previous = null;
  let kind = "NEW";
  let paidAt = joinedAt;
  for (let guard = 0; guard < 4; guard += 1) {
    const draft = await term(member.id, p, start, { status: "ACTIVE", kind, renewedFromId: previous?.id ?? null, createdAt: kind === "NEW" ? applied : new Date(paidAt.getTime() - DAY) });
    if (kind === "NEW") {
      ev(draft.id, null, approval ? "PENDING_APPROVAL" : "PENDING_PAYMENT", applied, "applied");
      if (approval) {
        ev(draft.id, "PENDING_APPROVAL", "PENDING_PAYMENT", new Date(applied.getTime() + (joinedAt - applied) * 0.7), "approved", actor);
        audits.push({ action: "MEMBERSHIP_APPROVE", actorUserId: actor, organisationId: org.id, targetType: "MembershipTerm", targetId: draft.id, createdAt: new Date(applied.getTime() + (joinedAt - applied) * 0.7) });
      }
      ev(draft.id, "PENDING_PAYMENT", "ACTIVE", paidAt, "paid", actor);
    } else {
      ev(draft.id, null, "PENDING_PAYMENT", new Date(paidAt.getTime() - DAY), "renewal-started");
      const early = paidAt < start;
      ev(draft.id, "PENDING_PAYMENT", early ? "UPCOMING" : "ACTIVE", paidAt, "paid");
      if (early && start <= now) ev(draft.id, "UPCOMING", "ACTIVE", start, "sweep");
      ev(previous.id, early ? "ACTIVE" : "GRACE", "ENDED", previous.endsAt, early ? "sweep" : "renewed");
      if (!early) ev(previous.id, "ACTIVE", "GRACE", previous.endsAt, "sweep");
      await prisma.membershipTerm.update({ where: { id: previous.id }, data: { status: "ENDED" } });
    }
    const end = draft.endsAt;
    if (end > now) {
      const revokeAt = new Date(now.getTime() - random() * 60 * DAY);
      if (random() < 0.03 && revokeAt > start) {
        await prisma.membershipTerm.update({ where: { id: draft.id }, data: { status: "REVOKED", decidedAt: revokeAt, decidedById: actor, reason: "Sample revocation" } });
        ev(draft.id, "ACTIVE", "REVOKED", revokeAt, "revoke", actor);
      } else if (end.getTime() - now.getTime() < 30 * DAY && random() < 0.35) {
        // Paid early: the next year waits as UPCOMING.
        const early = new Date(now.getTime() - random() * 5 * DAY);
        const next = await term(member.id, p, end, { status: "UPCOMING", kind: "RENEWAL", renewedFromId: draft.id, createdAt: new Date(early.getTime() - DAY) });
        ev(next.id, null, "PENDING_PAYMENT", new Date(early.getTime() - DAY), "renewal-started");
        ev(next.id, "PENDING_PAYMENT", "UPCOMING", early, "paid");
      }
      break;
    }
    // The term has ended: renewed (early, on time or in grace) or not.
    const renews = random() < (p === student ? 0.58 : 0.76);
    if (renews) {
      paidAt = new Date(end.getTime() + (random() * 40 - 28) * DAY);
      if (paidAt > now) paidAt = new Date(now.getTime() - DAY);
      previous = draft;
      kind = "RENEWAL";
      start = end;
      continue;
    }
    const grace = draft.graceUntil;
    ev(draft.id, "ACTIVE", "GRACE", end, "sweep");
    if (grace <= now) {
      ev(draft.id, "GRACE", "LAPSED", grace, "sweep");
      await prisma.membershipTerm.update({ where: { id: draft.id }, data: { status: "LAPSED" } });
      // Some come back months later with a fresh membership.
      const back = new Date(grace.getTime() + (30 + random() * 200) * DAY);
      if (random() < 0.14 && back < new Date(now.getTime() - 2 * DAY)) {
        previous = null;
        kind = "NEW";
        start = dayStart(back);
        paidAt = back;
        continue;
      }
    } else await prisma.membershipTerm.update({ where: { id: draft.id }, data: { status: "GRACE" } });
    break;
  }
}

await prisma.termStatusEvent.createMany({ data: events });
await prisma.auditEvent.createMany({ data: audits });
await prisma.orgCounter.upsert({ where: { organisationId_name: { organisationId: org.id, name: "member" } }, create: { organisationId: org.id, name: "member", next: counter + 1 }, update: { next: counter + 1 } });
await prisma.$disconnect();
console.log(`seed-reports: ${counter} members, ${events.length} status events, 7 units, 3 plans; viewer@demo.test (Viewer) and south@demo.test (Manager, South Kerala).`);
