import { requireSuperAdmin } from "@/lib/permissions";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadDailyEmail } from "@/lib/superAdminData";
import { EMAIL_SERIES } from "@/lib/superAdminSeries";
import { getEmailSettings } from "@/lib/instanceSettings";
import { providerReady } from "@/lib/email/providerConfig";
import { EMAIL_PROVIDER_LABELS } from "@/lib/email/providerList";
import { fillDailySeries, outboxByKind, windowStart } from "@/lib/superAdminInsights";
const WINDOW_DAYS = 14;
const STUCK_AFTER_MS = 15 * 60_000;



export async function loadSuperAdminEmailView() {
  await requireSuperAdmin();
  const now = new Date();
  const since = windowStart(WINDOW_DAYS, now);
  const [kindGroups, dailyRows, stuckPending, stuckProcessing, settings, row, suppressions] = await Promise.all([
    prisma.outboxMessage.groupBy({ by: ["kind", "status"], _count: { _all: true } }),
    loadDailyEmail(since),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PROCESSING, lockedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    getEmailSettings(),
    prisma.instanceSetting.findUnique({ where: { id: "global" }, select: { emailVerifiedAt: true, emailLastError: true } }),
    prisma.emailSuppression.groupBy({ by: ["reason"], where: { organisationId: null }, _count: { _all: true } }),
  ]);
  const setUp = settings.provider === "smtp" ? Boolean(settings.service || settings.host) : providerReady(settings.provider, settings.providerConfig ?? {});
  const count = (reason: string) => suppressions.find((group) => group.reason === reason)?._count._all ?? 0;
  const provider = { label: EMAIL_PROVIDER_LABELS[settings.provider], setUp, testedAt: row?.emailVerifiedAt ?? null, lastError: row?.emailLastError ?? null, bounced: count("BOUNCE"), complained: count("COMPLAINT") };
  const kinds = outboxByKind(kindGroups.map((group) => ({ kind: group.kind, status: group.status, count: group._count._all })));
  const daily = fillDailySeries(dailyRows, EMAIL_SERIES, WINDOW_DAYS, now);
  const totals = kinds.reduce((sum, row) => ({ pending: sum.pending + row.pending, failed: sum.failed + row.failed, sent: sum.sent + row.sent, total: sum.total + row.total }), { pending: 0, failed: 0, sent: 0, total: 0 });
  return { totals, stuckPending, stuckProcessing, daily, kinds, provider };
}
