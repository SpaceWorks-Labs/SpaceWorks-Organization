import type { SuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";
import { BarList } from "@/components/reports/charts/BarList";
import { ChartFrame, DataTable } from "@/components/reports/charts/ChartFrame";
import { TrendChart } from "@/components/reports/charts/TrendChart";
import { count, humanise, percent } from "./format";
import { Empty, Section, StatList } from "./parts";

type View = SuperAdminOperationsHealthView;

/** Phone codes by SMS: how many were asked for, how many were used, and what the providers reported. Counts only, never a number. */
export function OperationsSms({ view }: { view: View }) {
  const { totals, byDelivery, byPurpose } = view.smsCodes;
  return (
    <Section id="ops-sms" title="SMS codes" description={`Sign-in and verification codes sent by SMS over the last ${view.days} days.`}>
      <StatList
        label="SMS code totals"
        items={[
          { label: "Requested", value: count(totals.requested) },
          { label: "Used", value: count(totals.consumed), hint: totals.usedRate === null ? undefined : `${percent(totals.usedRate)} of requested` },
          { label: "Expired unused", value: count(totals.expired) },
          { label: "Still valid", value: count(totals.open) },
        ]}
      />
      {totals.requested ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartFrame title="By delivery report" description="What the SMS provider reported for each code.">
            <BarList label="SMS codes by delivery report" items={byDelivery.map((row) => ({ key: row.state, label: humanise(row.state), value: row.count }))} />
          </ChartFrame>
          <ChartFrame title="By purpose" description="What each code was asked for.">
            <BarList label="SMS codes by purpose" items={byPurpose.map((row) => ({ key: row.purpose, label: humanise(row.purpose), value: row.count }))} />
          </ChartFrame>
        </div>
      ) : (
        <p className="text-label text-ink-muted">No SMS codes were requested in the last {view.days} days.</p>
      )}
    </Section>
  );
}

/**
 * Sign-in security: successful and failed sign-ins and automatic address blocks per day, and failures by
 * method and reason. Failures are recorded at most once a minute per method and reason, so they are a floor.
 */
export function OperationsSignIns({ view }: { view: View }) {
  const { totals, byDay, byReason } = view.signIns;
  const any = byDay.some((d) => d.failed + d.blocked > 0);
  return (
    <Section id="ops-sign-in" title="Sign-ins" description={`Last ${view.days} days. Failed sign-ins count minutes with a failure for each method and reason, so real attempts may be higher. Addresses blocked now are not counted.`}>
      <StatList
        label="Sign-in totals"
        items={[
          { label: "Signed in", value: count(totals.succeeded) },
          { label: "Failed", value: count(totals.failed), hint: "At least" },
          { label: "Addresses blocked", value: count(totals.blocked), hint: "Automatic blocks recorded" },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Failed sign-ins and blocks each day"
          table={{ columns: ["Day", "Failed", "Blocked", "Signed in"], rows: byDay.map((d) => [d.label, count(d.failed), count(d.blocked), count(d.succeeded)]) }}
        >
          {any ? (
            <TrendChart
              ariaLabel={`Failed sign-ins and automatic address blocks each day over the last ${view.days} days`}
              labels={byDay.map((d) => d.label)}
              series={[{ key: "failed", label: "Failed", slot: 1, values: byDay.map((d) => d.failed) }, { key: "blocked", label: "Blocked", slot: 2, values: byDay.map((d) => d.blocked) }]}
            />
          ) : (
            <Empty>No failed sign-ins or blocks in the last {view.days} days.</Empty>
          )}
        </ChartFrame>
        <ChartFrame title="Failures by method and reason">
          {byReason.length ? (
            <DataTable table={{ caption: "Failed sign-ins by method and reason", columns: ["Method and reason", "Failed"], rows: byReason.map((r) => [`${humanise(r.method)}: ${humanise(r.reason).toLowerCase()}`, count(r.count)]) }} />
          ) : (
            <Empty>No failed sign-ins in the last {view.days} days.</Empty>
          )}
        </ChartFrame>
      </div>
    </Section>
  );
}
