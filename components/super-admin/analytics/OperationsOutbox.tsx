import type { SuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";
import { ChartFrame, DataTable } from "@/components/reports/charts/ChartFrame";
import { StackedColumnChart } from "@/components/reports/charts/StackedColumnChart";
import { count, duration, humanise, percent } from "./format";
import { ComparedTile, Empty, Section, tileGrid } from "./parts";

type View = SuperAdminOperationsHealthView;

/** The queue now: what is waiting, how long the oldest has waited, and what gave up. Current figures, not the range. */
export function OperationsTiles({ view }: { view: View }) {
  const { now, totals } = view.outbox;
  const oldestHint = now.oldestPendingKind ? `${humanise(now.oldestPendingKind)}, waiting now` : "Nothing waiting now";
  return (
    <div className={tileGrid}>
      <ComparedTile label="Waiting to send" value={count(now.pending)} hint={now.processing ? `${count(now.processing)} sending now` : "Queued now"} />
      <ComparedTile label="Oldest waiting" value={now.oldestPendingSeconds === null ? "None" : duration(now.oldestPendingSeconds)} hint={oldestHint} />
      <ComparedTile label="Failed, kept for review" value={count(now.failed)} hint="Gave up after retries, all time" />
      <ComparedTile label={`Sent, last ${view.days} days`} value={count(totals.sent)} hint={`${count(totals.failed)} failed in the same days`} />
    </div>
  );
}

/** Every outbox message created each day by where it ended up, and the same by kind with each kind's failure rate. */
export function OperationsOutbox({ view }: { view: View }) {
  const { byDay, byKind, totals } = view.outbox;
  const labels = byDay.map((day) => day.label);
  return (
    <Section id="ops-outbox" title="Outbox" description={`Emails, codes, alerts and messages queued each day over the last ${view.days} days, by where each one stands now.`}>
      <ChartFrame
        title="Messages queued each day"
        description="Sent, failed, retrying (tried at least once, still waiting) and waiting (not tried yet)."
        table={{ columns: ["Day", "Sent", "Failed", "Retrying", "Waiting", "Sending"], rows: byDay.map((d) => [d.label, count(d.sent), count(d.failed), count(d.retrying), count(d.pending), count(d.processing)]) }}
      >
        {totals.total ? (
          <StackedColumnChart
            ariaLabel={`Outbox messages queued each day over the last ${view.days} days, by status`}
            labels={labels}
            columns={[[
              { key: "sent", label: "Sent", slot: 1, values: byDay.map((d) => d.sent) },
              { key: "failed", label: "Failed", slot: 2, values: byDay.map((d) => d.failed) },
              { key: "retrying", label: "Retrying", slot: 3, values: byDay.map((d) => d.retrying) },
              { key: "pending", label: "Waiting", slot: 4, values: byDay.map((d) => d.pending + d.processing) },
            ]]}
          />
        ) : (
          <Empty>Nothing was queued in the last {view.days} days.</Empty>
        )}
      </ChartFrame>
      {byKind.length ? (
        <ChartFrame title="By kind" description="Failure rate is failed against sent and failed together.">
          <DataTable
            table={{
              caption: "Outbox messages by kind",
              columns: ["Kind", "Sent", "Failed", "Retrying", "Waiting", "Failure rate"],
              rows: byKind.map((k) => [humanise(k.kind), count(k.sent), count(k.failed), count(k.retrying), count(k.pending + k.processing), percent(k.failureRate)]),
            }}
          />
        </ChartFrame>
      ) : null}
    </Section>
  );
}
