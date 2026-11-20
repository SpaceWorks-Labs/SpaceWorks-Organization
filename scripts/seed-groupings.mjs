// Sample groupings for the SpaceWorks demo organisation, for seed-reports.mjs: Profession (one value per member) and
// Interests (several), with values given to every member deterministically so the groupings screen, member filters,
// smart groups and grouping breakdowns have data. Paths follow lib/groupings: ancestor ids joined by "/", ending with
// the value's own id (these are flat lists, so the path is the id).

const GROUPINGS = [
  { key: "profession", name: "Profession", multiple: false, values: [["ENG", "Engineering"], ["DES", "Design"], ["MKT", "Marketing"], ["STU", "Student"], ["OTH", "Other"]] },
  { key: "interests", name: "Interests", multiple: true, values: [["OSS", "Open source"], ["CLOUD", "Cloud"], ["MOBILE", "Mobile"], ["COMM", "Community"]] },
];

// The team's own answers, by email; everyone else gets values from their position in the list.
const TEAM_VALUES = {
  "shaan@demo.test": { profession: ["ENG"], interests: ["OSS", "CLOUD"] },
  "abhiram@demo.test": { profession: ["ENG"], interests: ["CLOUD"] },
  "abdulsamad@demo.test": { profession: ["ENG"], interests: ["OSS", "MOBILE"] },
  "midlaj@demo.test": { profession: ["ENG"], interests: ["CLOUD", "COMM"] },
  "ajzal@demo.test": { profession: ["MKT"], interests: ["COMM"] },
  "anin@demo.test": { profession: ["STU"], interests: ["MOBILE"] },
};

/** Creates the groupings and their values, then gives every member of `org` a profession and one or two interests. */
export async function seedGroupings(prisma, { org }) {
  const ids = {};
  for (const [sortOrder, grouping] of GROUPINGS.entries()) {
    const row = await prisma.orgGrouping.create({ data: { organisationId: org.id, key: grouping.key, name: grouping.name, kind: "list", multiple: grouping.multiple, sortOrder } });
    ids[grouping.key] = { id: row.id, values: {} };
    for (const [order, [code, label]] of grouping.values.entries()) {
      const value = await prisma.orgGroupingValue.create({ data: { organisationId: org.id, groupingId: row.id, label, code, path: "pending", sortOrder: order } });
      await prisma.orgGroupingValue.update({ where: { id: value.id }, data: { path: value.id } });
      ids[grouping.key].values[code] = value.id;
    }
  }

  const members = await prisma.member.findMany({ where: { organisationId: org.id, anonymisedAt: null }, select: { id: true, email: true }, orderBy: { memberNumber: "asc" } });
  const rows = [];
  for (const [index, member] of members.entries()) {
    const professions = GROUPINGS[0].values.map(([code]) => code);
    const interests = GROUPINGS[1].values.map(([code]) => code);
    const chosen = TEAM_VALUES[member.email] ?? {
      profession: [professions[index % professions.length]],
      interests: index % 3 === 0 ? [interests[index % 4], interests[(index + 1) % 4]] : [interests[index % 4]],
    };
    for (const [key, codes] of Object.entries(chosen)) {
      for (const code of codes) rows.push({ organisationId: org.id, memberId: member.id, groupingId: ids[key].id, valueId: ids[key].values[code] });
    }
  }
  await prisma.memberGroupingValue.createMany({ data: rows });
  return ids;
}
