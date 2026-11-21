/**
 * Platform operations health, pure over grouped counts: the outbox by day, kind and status; emails; member
 * messages by channel; team chat alerts; SMS codes; sign-in failures; and background job heartbeats. Counts
 * only: no address, number, message text, IP or credential is ever an input here. Definitions: docs/REPORTS.md
 * "Platform analytics".
 */
import { MEMBER_CHANNELS } from "@/lib/messages/kinds";
import { periodBuckets, type Bucket } from "./period";

const DAY = 86_400_000;
export const OPS_DAY_RANGES = [7, 30, 90] as const;
export type OpsDays = (typeof OPS_DAY_RANGES)[number];

export type OpsWindow = { days: OpsDays; from: Date; to: Date; buckets: Bucket[] };

/** The last 7, 30 or 90 UTC days, today included, one bucket per day. */
export function opsWindow(input: string | undefined | null, now: Date): OpsWindow {
  const asked = Number(input);
  const days = (OPS_DAY_RANGES as readonly number[]).includes(asked) ? (asked as OpsDays) : 30;
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(to.getTime() - days * DAY);
  const firstDay = { year: from.getUTCFullYear(), month: from.getUTCMonth() + 1, day: from.getUTCDate() };
  return { days, from, to, buckets: periodBuckets({ from, to, firstDay }, "UTC", "day") };
}

/** The bucket key (YYYY-MM-DD, UTC) of a day. */
export const dayKeyOf = (day: Date) => day.toISOString().slice(0, 10);

type DayCount = { day: Date; count: number };
const days = (buckets: Bucket[]) => new Map(buckets.map((bucket) => [bucket.key, bucket]));

// ---- Outbox -----------------------------------------------------------------------------------------------------

export type OutboxGroup = { day: Date; kind: string; status: "PENDING" | "PROCESSING" | "SENT" | "FAILED"; /** Pending but already tried at least once. */ retrying: boolean; count: number };
export type OutboxCounts = { sent: number; failed: number; pending: number; retrying: number; processing: number };
const noOutbox = (): OutboxCounts => ({ sent: 0, failed: 0, pending: 0, retrying: 0, processing: 0 });

function addOutbox(counts: OutboxCounts, group: OutboxGroup) {
  if (group.status === "SENT") counts.sent += group.count;
  else if (group.status === "FAILED") counts.failed += group.count;
  else if (group.status === "PROCESSING") counts.processing += group.count;
  else if (group.retrying) counts.retrying += group.count;
  else counts.pending += group.count;
}

const outboxTotal = (counts: OutboxCounts) => counts.sent + counts.failed + counts.pending + counts.retrying + counts.processing;

/** Outbox messages per day (for a stacked chart) and per kind, with each kind's failure rate (failed over sent plus failed, null with neither). */
export function outboxRollup(groups: OutboxGroup[], buckets: Bucket[]) {
  const byDay = new Map(buckets.map((bucket) => [bucket.key, noOutbox()]));
  const byKind = new Map<string, OutboxCounts>();
  const totals = noOutbox();
  for (const group of groups) {
    const slot = byDay.get(dayKeyOf(group.day));
    if (!slot) continue;
    addOutbox(slot, group);
    addOutbox(totals, group);
    const kind = byKind.get(group.kind) ?? noOutbox();
    addOutbox(kind, group);
    byKind.set(group.kind, kind);
  }
  return {
    totals: { ...totals, total: outboxTotal(totals) },
    byDay: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...byDay.get(bucket.key)! })),
    byKind: [...byKind]
      .map(([kind, counts]) => ({ kind, ...counts, total: outboxTotal(counts), failureRate: counts.sent + counts.failed ? counts.failed / (counts.sent + counts.failed) : null }))
      .sort((a, b) => b.total - a.total || a.kind.localeCompare(b.kind)),
  };
}

/** Whole seconds since `createdAt`, or null with nothing pending. */
export function ageSeconds(createdAt: Date | null, now: Date): number | null {
  return createdAt ? Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 1000)) : null;
}

/** What an outbox kind carries: member and system emails are "email"; the rest have their own section. */
export type OutboxChannel = "email" | "sms" | "chat" | "member-message" | "system";
export function outboxChannel(kind: string): OutboxChannel {
  if (kind === "sms-code") return "sms";
  if (kind === "chat-notice") return "chat";
  if (kind === "member-message") return "member-message";
  if (kind.endsWith("-purge")) return "system";
  return "email";
}

// ---- Email, chat alerts -----------------------------------------------------------------------------------------

export type SuppressionGroup = { day: Date; reason: "BOUNCE" | "COMPLAINT"; count: number };

/**
 * Emails per day: sent and failed from the outbox (email kinds only), bounced and complained from the providers'
 * reports (addresses added to the suppression list that day). `suppressedTotal` is the list's size now: addresses
 * sends now skip.
 */
export function emailRollup(groups: OutboxGroup[], suppression: SuppressionGroup[], suppressedTotal: number, buckets: Bucket[]) {
  const mail = outboxRollup(groups.filter((group) => outboxChannel(group.kind) === "email"), buckets);
  const keys = days(buckets);
  const bounced = new Map<string, number>();
  const complained = new Map<string, number>();
  for (const row of suppression) {
    const key = dayKeyOf(row.day);
    if (!keys.has(key)) continue;
    const target = row.reason === "BOUNCE" ? bounced : complained;
    target.set(key, (target.get(key) ?? 0) + row.count);
  }
  const byDay = mail.byDay.map((day) => ({ ...day, bounced: bounced.get(day.key) ?? 0, complained: complained.get(day.key) ?? 0 }));
  return {
    totals: { sent: mail.totals.sent, failed: mail.totals.failed, pending: mail.totals.pending + mail.totals.retrying + mail.totals.processing, bounced: byDay.reduce((sum, day) => sum + day.bounced, 0), complained: byDay.reduce((sum, day) => sum + day.complained, 0), suppressedTotal },
    byDay,
    byKind: mail.byKind,
  };
}

/** Team chat alerts per day (outbox "chat-notice" rows). */
export function chatAlertRollup(groups: OutboxGroup[], buckets: Bucket[]) {
  const { totals, byDay } = outboxRollup(groups.filter((group) => outboxChannel(group.kind) === "chat"), buckets);
  return { totals, byDay };
}

export type ChatChannelGroup = { kind: string; enabled: boolean; failing: boolean; count: number };

/** Configured team chat channels by kind: how many are on and how many are failing now. Counts only. */
export function chatChannelHealth(groups: ChatChannelGroup[]) {
  const kinds = new Map<string, { kind: string; total: number; enabled: number; failing: number }>();
  for (const group of groups) {
    const row = kinds.get(group.kind) ?? { kind: group.kind, total: 0, enabled: 0, failing: 0 };
    row.total += group.count;
    if (group.enabled) row.enabled += group.count;
    if (group.enabled && group.failing) row.failing += group.count;
    kinds.set(group.kind, row);
  }
  return [...kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind));
}

// ---- Member messages --------------------------------------------------------------------------------------------

export type MemberMessageGroup = { day: Date; channel: string | null; status: string; count: number };
type Delivery = { sent: number; failed: number; pending: number; other: number; total: number };
const noDelivery = (): Delivery => ({ sent: 0, failed: 0, pending: 0, other: 0, total: 0 });

function addDelivery(slot: Delivery, status: string, count: number) {
  if (status === "SENT") slot.sent += count;
  else if (status === "FAILED") slot.failed += count;
  else if (status === "PENDING") slot.pending += count;
  else slot.other += count;
  slot.total += count;
}

/**
 * Member messages by the channel that carried them (a message still pending has no channel: "none") and by day.
 * Every channel the platform supports is listed, even with no messages.
 */
export function memberMessageRollup(groups: MemberMessageGroup[], buckets: Bucket[]) {
  const channels = new Map<string, Delivery>(MEMBER_CHANNELS.map((channel) => [channel, noDelivery()]));
  const byDay = new Map(buckets.map((bucket) => [bucket.key, noDelivery()]));
  const totals = noDelivery();
  for (const group of groups) {
    const slot = byDay.get(dayKeyOf(group.day));
    if (!slot) continue;
    const name = group.channel ?? "NONE";
    const channel = channels.get(name) ?? channels.set(name, noDelivery()).get(name)!;
    addDelivery(slot, group.status, group.count);
    addDelivery(channel, group.status, group.count);
    addDelivery(totals, group.status, group.count);
  }
  return {
    totals,
    byChannel: [...channels].map(([channel, counts]) => ({ channel, ...counts })).filter((row) => row.total > 0 || (MEMBER_CHANNELS as readonly string[]).includes(row.channel)),
    byDay: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...byDay.get(bucket.key)! })),
  };
}

// ---- SMS codes --------------------------------------------------------------------------------------------------

export type SmsCodeGroup = { day: Date; purpose: string; /** consumed, expired (never used) or open (still valid). */ outcome: "consumed" | "expired" | "open"; deliveryState: string | null; count: number };

/** SMS codes requested per day, by outcome, by the provider's delivery report and by purpose. Counts only: no number, hash or code. */
export function smsCodeRollup(groups: SmsCodeGroup[], buckets: Bucket[]) {
  const byDay = new Map(buckets.map((bucket) => [bucket.key, { requested: 0, consumed: 0, expired: 0, open: 0 }]));
  const delivery = new Map<string, number>();
  const purpose = new Map<string, number>();
  const totals = { requested: 0, consumed: 0, expired: 0, open: 0 };
  for (const group of groups) {
    const slot = byDay.get(dayKeyOf(group.day));
    if (!slot) continue;
    slot.requested += group.count;
    slot[group.outcome] += group.count;
    totals.requested += group.count;
    totals[group.outcome] += group.count;
    const state = group.deliveryState ?? "unreported";
    delivery.set(state, (delivery.get(state) ?? 0) + group.count);
    purpose.set(group.purpose, (purpose.get(group.purpose) ?? 0) + group.count);
  }
  const list = (map: Map<string, number>, key: "state" | "purpose") => [...map].map(([name, count]) => ({ [key]: name, count })).sort((a, b) => b.count - a.count);
  return {
    totals: { ...totals, usedRate: totals.requested ? totals.consumed / totals.requested : null },
    byDay: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...byDay.get(bucket.key)! })),
    byDelivery: list(delivery, "state") as Array<{ state: string; count: number }>,
    byPurpose: list(purpose, "purpose") as Array<{ purpose: string; count: number }>,
  };
}

// ---- Sign-in security -------------------------------------------------------------------------------------------

export type SignInFailureGroup = { day: Date; method: string; reason: string; count: number };

/**
 * Failed sign-ins, blocked addresses and successful sign-ins per day. Failed sign-ins are audit rows written at most
 * once a minute per method and reason, so the figure counts minutes with failures, a floor on real attempts. Blocked
 * addresses are the automatic blocks recorded (the address itself is never read).
 */
export function signInRollup(failures: SignInFailureGroup[], blocks: DayCount[], successes: DayCount[], buckets: Bucket[]) {
  const byDay = new Map(buckets.map((bucket) => [bucket.key, { failed: 0, blocked: 0, succeeded: 0 }]));
  const reasons = new Map<string, { method: string; reason: string; count: number }>();
  const add = (rows: DayCount[], key: "blocked" | "succeeded") => {
    for (const row of rows) {
      const slot = byDay.get(dayKeyOf(row.day));
      if (slot) slot[key] += row.count;
    }
  };
  for (const row of failures) {
    const slot = byDay.get(dayKeyOf(row.day));
    if (!slot) continue;
    slot.failed += row.count;
    const id = `${row.method}:${row.reason}`;
    const entry = reasons.get(id) ?? { method: row.method, reason: row.reason, count: 0 };
    entry.count += row.count;
    reasons.set(id, entry);
  }
  add(blocks, "blocked");
  add(successes, "succeeded");
  const series = buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, ...byDay.get(bucket.key)! }));
  return {
    totals: { failed: series.reduce((sum, day) => sum + day.failed, 0), blocked: series.reduce((sum, day) => sum + day.blocked, 0), succeeded: series.reduce((sum, day) => sum + day.succeeded, 0) },
    byDay: series,
    byReason: [...reasons.values()].sort((a, b) => b.count - a.count || a.method.localeCompare(b.method) || a.reason.localeCompare(b.reason)),
  };
}

// ---- Job heartbeats ---------------------------------------------------------------------------------------------

export type HeartbeatRow = { key: string; lastStartedAt: Date | null; lastSucceededAt: Date | null; lastSent: number; lastFailed: number; hasError: boolean };

const KNOWN_JOBS: Record<string, { label: string; staleAfterSeconds: number }> = {
  "outbox-scheduler": { label: "Message delivery", staleAfterSeconds: 180 },
  worker: { label: "Background worker", staleAfterSeconds: 180 },
  "report-rollup": { label: "Daily report rollup", staleAfterSeconds: 1800 },
};

/** Fresh: succeeded inside its window. Stale: succeeded, but longer ago. Never: no success recorded. Unknown window: a job this list does not know (age only). */
export function heartbeatStatuses(rows: HeartbeatRow[], now: Date) {
  return rows
    .map((row) => {
      const known = KNOWN_JOBS[row.key];
      const age = ageSeconds(row.lastSucceededAt, now);
      const status: "fresh" | "stale" | "never" | "unknown" = age === null ? "never" : !known ? "unknown" : age <= known.staleAfterSeconds ? "fresh" : "stale";
      return { key: row.key, label: known?.label ?? row.key, status, lastStartedAt: row.lastStartedAt, lastSucceededAt: row.lastSucceededAt, ageSeconds: age, staleAfterSeconds: known?.staleAfterSeconds ?? null, lastSent: row.lastSent, lastFailed: row.lastFailed, hasError: row.hasError };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
