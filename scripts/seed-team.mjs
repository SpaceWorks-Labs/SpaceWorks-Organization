// The SpaceWorks team as members of the SpaceWorks sample organisation, for seed-reports.mjs: each with their title
// as the primary member role (printed on the card), a home unit, a membership and a live card numbered SWK-0001 on.
// Created last, so they top the member list. Fictional contact details only (@demo.test, +91 90000 000xx).
import crypto from "node:crypto";

export const TEAM = [
  { email: "shaan@demo.test", name: "Shaan Shoukath", title: "Systems Engineer", unit: "COK", story: "annual" },
  { email: "abhiram@demo.test", name: "Abhiram NJ", title: "Cloud Specialist", unit: "KKD", story: "annual" },
  { email: "abdulsamad@demo.test", name: "Abdul Samad MJ", title: "Full Stack Developer", unit: "TCR", story: "annual" },
  { email: "midlaj@demo.test", name: "Midlaj C", title: "Backend Engineer", unit: "KNR", story: "annual" },
  // In grace on the student plan, with a renewal started and waiting for payment.
  { email: "ajzal@demo.test", name: "Ajzal P", title: "Marketing Specialist", unit: "KKD", story: "grace" },
  // A student member who has applied for annual membership, waiting for approval.
  { email: "anin@demo.test", name: "Anin Arafath", title: "App Developer", unit: "TVM", story: "upgrade" },
];

/**
 * Creates the team's member records, terms, roles and cards. `ctx` carries seed-reports' organisation, clock helpers,
 * plans, units, roles, the event and audit collectors and the member number counter; returns the next member number.
 */
export async function seedTeam(prisma, ctx) {
  const { org, now, DAY, dayStart, addMonths, fyEnd, annual, student, units, roles, ev, audits, actor } = ctx;
  let counter = ctx.counter;
  const HOUR = 3_600_000;
  const graceOf = (end) => new Date(end.getTime() + 15 * DAY);
  const term = (data) => prisma.membershipTerm.create({ data: { organisationId: org.id, ...data } });

  // The organisation's card numbering: an approved default design (the built-in community preset) with prefix SWK.
  const design =
    (await prisma.cardDesign.findFirst({ where: { organisationId: org.id, planId: null, roleId: null } })) ??
    (await prisma.cardDesign.create({
      data: { organisationId: org.id, design: { preset: "community", backEnabled: true }, numberPrefix: "SWK", numberFormat: "{PREFIX}-{SEQ:4}", approvedById: actor, approvedAt: now, updatedById: actor },
    }));
  // Numbered in list order (Shaan is SWK-0001), whatever order the records are created in.
  const card = async (seq, memberId, planId, issuedAt) => {
    const issued = await prisma.memberCard.create({
      data: { organisationId: org.id, memberId, planId, cardNumber: `${design.numberPrefix}-${String(seq).padStart(4, "0")}`, verifyToken: crypto.randomBytes(32).toString("base64url"), issuedAt, issuedById: actor },
    });
    audits.push({ action: "CARD_ISSUED", actorUserId: actor, organisationId: org.id, targetType: "MemberCard", targetId: issued.id, createdAt: issuedAt });
  };

  // Oldest first, so Shaan is the newest record and heads the list.
  for (const [index, person] of [...TEAM.entries()].reverse()) {
    const createdAt = new Date(now.getTime() - (index + 1) * 3 * HOUR);
    const member = await prisma.member.create({
      data: {
        organisationId: org.id, email: person.email, name: person.name, memberNumber: (counter += 1), unitId: units[person.unit].id,
        phone: `+91 90000 000${String(index + 1).padStart(2, "0")}`, stateCode: "KL", source: person.story === "annual" ? "JOIN_FORM" : "IMPORT", createdAt,
      },
    });
    const role = roles.find((one) => one.name === person.title);
    await prisma.memberRoleAssignment.create({ data: { organisationId: org.id, memberId: member.id, roleId: role.id, isPrimary: true, assignedAt: createdAt } });

    if (person.story === "annual") {
      // Applied from the join link today, approved and paid within the hour: active to the end of the financial year.
      const approvedAt = new Date(createdAt.getTime() + HOUR);
      const paidAt = new Date(createdAt.getTime() + 2 * HOUR);
      const startsAt = dayStart(paidAt);
      const endsAt = fyEnd(startsAt);
      const held = await term({ memberId: member.id, planId: annual.id, status: "ACTIVE", kind: "NEW", currency: annual.currency, priceMinor: annual.priceNewMinor, joiningFeeMinor: annual.joiningFeeMinor, startsAt, endsAt, graceUntil: graceOf(endsAt), createdAt });
      ev(held.id, null, "PENDING_APPROVAL", createdAt, "applied");
      ev(held.id, "PENDING_APPROVAL", "PENDING_PAYMENT", approvedAt, "approved", actor);
      ev(held.id, "PENDING_PAYMENT", "ACTIVE", paidAt, "paid", actor);
      audits.push({ action: "MEMBERSHIP_APPROVE", actorUserId: actor, organisationId: org.id, targetType: "MembershipTerm", targetId: held.id, createdAt: approvedAt });
      await card(index + 1, member.id, annual.id, paidAt);
      continue;
    }

    // Student terms run twelve months from the day they were paid.
    const startsAt = dayStart(new Date(now.getTime() - (person.story === "grace" ? 372 : 150) * DAY));
    const endsAt = addMonths(startsAt, 12);
    const held = await term({ memberId: member.id, planId: student.id, status: person.story === "grace" ? "GRACE" : "ACTIVE", kind: "NEW", currency: student.currency, priceMinor: student.priceNewMinor, joiningFeeMinor: student.joiningFeeMinor, startsAt, endsAt, graceUntil: graceOf(endsAt), createdAt: startsAt });
    ev(held.id, null, "PENDING_PAYMENT", startsAt, "applied");
    ev(held.id, "PENDING_PAYMENT", "ACTIVE", startsAt, "paid", actor);
    await card(index + 1, member.id, student.id, startsAt);

    if (person.story === "grace") {
      ev(held.id, "ACTIVE", "GRACE", endsAt, "sweep");
      const startedAt = new Date(now.getTime() - 2 * DAY);
      const renewal = await term({ memberId: member.id, planId: student.id, status: "PENDING_PAYMENT", kind: "RENEWAL", renewedFromId: held.id, currency: student.currency, priceMinor: student.priceRenewalMinor, joiningFeeMinor: 0, paymentDueBy: graceOf(endsAt), createdAt: startedAt });
      ev(renewal.id, null, "PENDING_PAYMENT", startedAt, "renewal-started");
    } else {
      const appliedAt = new Date(now.getTime() - DAY);
      const application = await term({ memberId: member.id, planId: annual.id, status: "PENDING_APPROVAL", kind: "NEW", currency: annual.currency, priceMinor: annual.priceNewMinor, joiningFeeMinor: annual.joiningFeeMinor, createdAt: appliedAt });
      ev(application.id, null, "PENDING_APPROVAL", appliedAt, "applied");
    }
  }

  await prisma.orgCounter.upsert({
    where: { organisationId_name: { organisationId: org.id, name: "card" } },
    create: { organisationId: org.id, name: "card", next: TEAM.length + 1 },
    update: { next: TEAM.length + 1 },
  });
  return counter;
}
