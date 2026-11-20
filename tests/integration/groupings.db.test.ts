import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getRedisClient: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { teamScope } from "@/lib/membership/scope";
import { getMembership } from "@/lib/permissions";
import { createGrouping, createValue, GroupingError, lockGroupings, moveValue, setValueArchived, updateGrouping } from "@/lib/groupings/service";
import { replaceMemberValues } from "@/lib/groupings/memberValues";
import { resolveGroupingAnswers, saveGroupingAnswers } from "@/lib/groupings/answers";
import { memberInSmartGroup, smartGroupWhere, smartGroupWhereInScope } from "@/lib/groups/conditions";
import { createOrgInvite } from "@/app/actions/org-invites";
import { saveSmartGroup } from "@/app/actions/smart-groups";
import { mayGrant, reachOf } from "@/lib/team/granting";
import { acceptOrganisationInviteToken } from "@/lib/inviteAcceptance";
import { addStaff, starterRole } from "../helpers/staff";

// Groupings: the tree service, answers on the join form, smart groups, granting inside a limit, and tenant isolation.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let other: { id: string; slug: string };
const ids: Record<string, string> = {};
const run = <T>(work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) => prisma.$transaction(async (tx) => { await lockGroupings(tx, org.id); return work(tx); });
const as = (key: string) => { identity.current = { id: users[key]! }; };

beforeAll(async () => {
  org = await prisma.organisation.create({ data: { name: "Groupings", slug: `groupings-${suffix}`, status: "ACTIVE" } });
  other = await prisma.organisation.create({ data: { name: "Other", slug: `groupings-other-${suffix}`, status: "ACTIVE" } });
  for (const key of ["owner", "doctorLead"]) users[key] = (await prisma.user.create({ data: { email: `${key.toLowerCase()}-${suffix}@example.test`, name: key, emailVerified: new Date(), mfaEnabledAt: new Date() } })).id;
  await addStaff(org.id, users.owner!, "OWNER");
  ids.lead = (await addStaff(org.id, users.doctorLead!, "ADMIN")).id;
});

afterAll(async () => {
  for (const id of [org.id, other.id]) {
    await prisma.teamInvite.deleteMany({ where: { organisationId: id } });
    await prisma.teamMember.deleteMany({ where: { organisationId: id } });
    await prisma.organisation.delete({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("groupings and their values", () => {
  it("builds a tree, moves a subtree with its paths and depths, and refuses cycles", async () => {
    const region = await run((tx) => createGrouping(tx, org.id, { name: "Region", kind: "tree", multiple: false }));
    ids.region = region.id;
    expect(region.key).toBe("region");
    const make = (label: string, parent?: string) => run((tx) => createValue(tx, org.id, region.id, { label, parentId: parent ?? null })).then((value) => (ids[label] = value.id));
    await make("Asia"); await make("India", ids.Asia); await make("Kerala", ids.India); await make("Europe");
    await run((tx) => moveValue(tx, org.id, ids.India!, ids.Europe!));
    const kerala = await prisma.orgGroupingValue.findUniqueOrThrow({ where: { id: ids.Kerala! } });
    expect(kerala.path).toBe(`${ids.Europe}/${ids.India}/${ids.Kerala}`);
    expect(kerala.level).toBe(2);
    await expect(run((tx) => moveValue(tx, org.id, ids.Europe!, ids.Kerala!))).rejects.toThrow(GroupingError);
    await run((tx) => setValueArchived(tx, org.id, ids.India!, true));
    expect((await prisma.orgGroupingValue.findUniqueOrThrow({ where: { id: ids.Kerala! } })).archivedAt).not.toBeNull();
  });

  it("keeps a list flat and refuses two values per member until it allows several", async () => {
    const list = await run((tx) => createGrouping(tx, org.id, { name: "Profession", kind: "list", multiple: false }));
    ids.profession = list.id;
    await expect(run((tx) => createValue(tx, org.id, list.id, { label: "Child", parentId: ids.Asia! }))).rejects.toThrow(GroupingError);
    for (const label of ["Doctors", "Engineers"]) ids[label] = (await run((tx) => createValue(tx, org.id, list.id, { label, parentId: null }))).id;
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `m1-${suffix}@example.test`, name: "Member One", source: "MANUAL" }));
    ids.member = member.id;
    await expect(prisma.$transaction((tx) => replaceMemberValues(tx, org.id, member.id, list.id, [ids.Doctors!, ids.Engineers!]))).rejects.toThrow(/one value/);
    await prisma.$transaction((tx) => replaceMemberValues(tx, org.id, member.id, list.id, [ids.Doctors!]));
    await run((tx) => updateGrouping(tx, org.id, list.id, { name: "Profession", multiple: true }));
    await prisma.$transaction((tx) => replaceMemberValues(tx, org.id, member.id, list.id, [ids.Doctors!, ids.Engineers!]));
    await expect(run((tx) => updateGrouping(tx, org.id, list.id, { name: "Profession", multiple: false }))).rejects.toThrow(/several values/);
  });

  it("refuses values from another organisation, in the service and in the database", async () => {
    const foreign = await prisma.orgGrouping.create({ data: { organisationId: other.id, key: "profession", name: "Profession" } });
    const foreignValue = await prisma.orgGroupingValue.create({ data: { organisationId: other.id, groupingId: foreign.id, label: "Doctors", code: "DOC", path: "x" } });
    await expect(prisma.$transaction((tx) => replaceMemberValues(tx, org.id, ids.member!, ids.profession!, [foreignValue.id]))).rejects.toThrow(GroupingError);
    await expect(prisma.memberGroupingValue.create({ data: { organisationId: org.id, memberId: ids.member!, groupingId: ids.profession!, valueId: foreignValue.id } })).rejects.toThrow();
    await expect(prisma.teamMemberScope.create({ data: { organisationId: org.id, teamMemberId: ids.lead!, groupingId: foreign.id, valueId: foreignValue.id } })).rejects.toThrow();
  });
});

describe.sequential("join-form grouping answers", () => {
  const field = (required: boolean) => [{ key: "profession", label: "Profession", type: "GROUPING", required, adminOnly: false, groupingId: ids.profession }];

  it("validate required, one-or-several and archived values, then save with replace semantics", async () => {
    expect((await resolveGroupingAnswers(prisma, org.id, field(true), {}, false)).errors).toHaveProperty(["fieldValues.profession"]);
    const several = await resolveGroupingAnswers(prisma, org.id, field(false), { profession: `${ids.Doctors};${ids.Engineers}` }, false);
    expect(several.errors).toEqual({});
    await prisma.$transaction((tx) => saveGroupingAnswers(tx, org.id, ids.member!, several.answers));
    await run((tx) => setValueArchived(tx, org.id, ids.Engineers!, true));
    const refused = await resolveGroupingAnswers(prisma, org.id, field(false), { profession: ids.Engineers }, false);
    expect(refused.errors).toHaveProperty(["fieldValues.profession"]);
    // A new answer can't pick an archived value, but a member who holds one keeps it when re-saving.
    await expect(prisma.$transaction((tx) => replaceMemberValues(tx, org.id, ids.member!, ids.profession!, [ids.Doctors!, ids.Engineers!]))).resolves.toEqual({ changed: false });
    const cleared = await resolveGroupingAnswers(prisma, org.id, field(false), {}, false);
    await prisma.$transaction((tx) => saveGroupingAnswers(tx, org.id, ids.member!, cleared.answers));
    expect(await prisma.memberGroupingValue.count({ where: { memberId: ids.member!, groupingId: ids.profession! } })).toBe(0);
    await run((tx) => setValueArchived(tx, org.id, ids.Engineers!, false));
  });
});

describe.sequential("smart groups", () => {
  it("match by grouping, plan and answers inside the organisation, and never across organisations", async () => {
    await prisma.memberGroupingValue.create({ data: { organisationId: org.id, memberId: ids.member!, groupingId: ids.profession!, valueId: ids.Doctors! } });
    await prisma.member.update({ where: { id: ids.member! }, data: { fieldValues: { city: "Kochi", dob: "2000-06-15" } } });
    as("owner");
    const saved = await saveSmartGroup({
      organisationSlug: org.slug, name: "Young doctors in Kochi",
      condition: { type: "and", items: [{ type: "grouping", groupingId: ids.profession, valueIds: [ids.Doctors] }, { type: "answer", key: "city", op: "equals", value: "Kochi" }, { type: "age", key: "dob", min: 18, max: 40 }, { type: "not", item: { type: "status", statuses: ["REVOKED"] } }] },
    });
    expect(saved.ok).toBe(true);
    const groupId = (saved as { ok: true; data: { smartGroupId: string } }).data.smartGroupId;
    expect(await memberInSmartGroup(org.id, groupId, ids.member!)).toBe(true);
    // A different organisation asking for this group's id gets nobody, and the group can't be saved with foreign data.
    expect(await memberInSmartGroup(other.id, groupId, ids.member!)).toBe(false);
    expect(await prisma.member.count({ where: await smartGroupWhere(other.id, groupId) })).toBe(0);
    const foreign = await prisma.orgGrouping.findFirstOrThrow({ where: { organisationId: other.id } });
    const foreignValue = await prisma.orgGroupingValue.findFirstOrThrow({ where: { groupingId: foreign.id } });
    expect((await saveSmartGroup({ organisationSlug: org.slug, name: "Leaky", condition: { type: "grouping", groupingId: foreign.id, valueIds: [foreignValue.id] } })).ok).toBe(false);
    // Too young: the age rule drops the member.
    expect((await saveSmartGroup({ organisationSlug: org.slug, smartGroupId: groupId, name: "Young doctors in Kochi", condition: { type: "age", key: "dob", max: 10 } })).ok).toBe(true);
    expect(await memberInSmartGroup(org.id, groupId, ids.member!)).toBe(false);
    // Inside a limited manager's reach the group still never shows people outside it.
    const lead = (await getMembership(users.doctorLead!, org.id))!;
    await prisma.teamMemberScope.create({ data: { organisationId: org.id, teamMemberId: lead.id, groupingId: ids.profession!, valueId: ids.Engineers! } });
    const scope = await teamScope(org.id, (await getMembership(users.doctorLead!, org.id))!);
    expect(await prisma.member.count({ where: await smartGroupWhereInScope(scope, groupId) })).toBe(0);
    await prisma.teamMemberScope.deleteMany({ where: { teamMemberId: lead.id } });
  });
});

describe.sequential("granting inside a grouping limit", () => {
  it("lets a Doctors-limited giver grant Doctors only, never Engineers or the whole organisation", async () => {
    const lead = (await getMembership(users.doctorLead!, org.id))!;
    await prisma.teamMemberScope.create({ data: { organisationId: org.id, teamMemberId: lead.id, groupingId: ids.profession!, valueId: ids.Doctors! } });
    const limited = (await getMembership(users.doctorLead!, org.id))!;
    const reach = await reachOf(prisma, org.id, limited);
    const viewer = await starterRole(org.id, "VIEWER");
    const doctors = await prisma.orgGroupingValue.findUniqueOrThrow({ where: { id: ids.Doctors! } });
    const engineers = await prisma.orgGroupingValue.findUniqueOrThrow({ where: { id: ids.Engineers! } });
    const target = { role: viewer, unitId: null, unitPath: null };
    expect(mayGrant(limited, reach, { ...target, limits: [{ groupingId: doctors.groupingId, path: doctors.path }] })).toBe(true);
    expect(mayGrant(limited, reach, { ...target, limits: [{ groupingId: engineers.groupingId, path: engineers.path }] })).toBe(false);
    expect(mayGrant(limited, reach, target)).toBe(false);
    as("doctorLead");
    expect((await createOrgInvite({ organisationSlug: org.slug, roleId: viewer.id, valueIds: [ids.Engineers!] })).ok).toBe(false);
    expect((await createOrgInvite({ organisationSlug: org.slug, roleId: viewer.id })).ok).toBe(false);
    const ok = await createOrgInvite({ organisationSlug: org.slug, roleId: viewer.id, valueIds: [ids.Doctors!] });
    expect(ok).toMatchObject({ ok: true });
    const { inviteId, token } = (ok as { ok: true; data: { inviteId: string; token: string } }).data;
    expect(await prisma.teamInviteScope.count({ where: { teamInviteId: inviteId } })).toBe(1);
    // Accepting the invite carries the limit onto the new team member.
    const joiner = await prisma.user.create({ data: { email: `joiner-${suffix}@example.test`, name: "joiner", emailVerified: new Date() } });
    users.joiner = joiner.id;
    expect(await acceptOrganisationInviteToken(token, { id: joiner.id, email: joiner.email, emailVerified: true })).toMatchObject({ ok: true });
    const joined = await prisma.teamMember.findFirstOrThrow({ where: { organisationId: org.id, userId: joiner.id }, include: { scopes: true } });
    expect(joined.scopes.map((entry) => entry.valueId)).toEqual([ids.Doctors]);
  });
});
