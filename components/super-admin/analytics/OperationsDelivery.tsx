import type { SuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";
import { ChartFrame, DataTable } from "@/components/reports/charts/ChartFrame";
import { StackedColumnChart } from "@/components/reports/charts/StackedColumnChart";
import { count, humanise } from "./format";
import { Empty, Section, StatList } from "./parts";

type View = SuperAdminOperationsHealthView;

/** Emails sent and failed from the outbox, and bounces and complaints the providers reported, per day. */
export function OperationsEmails({ view }: { view: View }) {
  const { totals, byDay } = view.emails;
  const any = byDay.some((d) => d.sent + d.failed + d.bounced + d.complained > 0);
  return (
    <Section id="ops-email" title="Email" description={`Member and account emails over the last ${view.days} days. Bounces and complaints are addresses the providers reported, added to the suppression list that day.`}>
      <StatList
        label="Email totals"
        items={[
          { label: "Sent", value: count(totals.sent) },
          { label: "Failed", value: count(totals.failed) },
          { label: "Waiting", value: count(totals.pending) },
          { label: "Bounced", value: count(totals.bounced) },
          { label: "Complaints", value: count(totals.complained) },
          { label: "Suppressed now", value: count(totals.suppressedTotal), hint: "Addresses sends skip" },
        ]}
      />
      <ChartFrame
        title="Emails each day"
        description="Sent and failed stack together; bounced and complaints sit beside them."
        table={{ columns: ["Day", "Sent", "Failed", "Bounced", "Complaints"], rows: byDay.map((d) => [d.label, count(d.sent), count(d.failed), count(d.bounced), count(d.complained)]) }}
      >
        {any ? (
          <StackedColumnChart
            ariaLabel={`Emails sent, failed, bounced and complained about each day over the last ${view.days} days`}
            labels={byDay.map((d) => d.label)}
            columns={[
              [{ key: "sent", label: "Sent", slot: 1, values: byDay.map((d) => d.sent) }, { key: "failed", label: "Failed", slot: 2, values: byDay.map((d) => d.failed) }],
              [{ key: "bounced", label: "Bounced", slot: 3, values: byDay.map((d) => d.bounced) }, { key: "complained", label: "Complaints", slot: 4, values: byDay.map((d) => d.complained) }],
            ]}
          />
        ) : (
          <Empty>No emails in the last {view.days} days.</Empty>
        )}
      </ChartFrame>
    </Section>
  );
}

/** Member messages by the channel that carried them, and team chat alerts with the channels set up for them. */
export function OperationsMessaging({ view }: { view: View }) {
  const { memberMessages: messages, chatAlerts: chat } = view;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartFrame title="Member messages by channel" description={`Last ${view.days} days. A message still waiting has no channel yet.`}>
        {messages.totals.total ? (
          <DataTable
            table={{
              caption: "Member messages by channel",
              columns: ["Channel", "Sent", "Failed", "Waiting", "Other", "Total"],
              rows: [
                ...messages.byChannel.map((c) => [humanise(c.channel), count(c.sent), count(c.failed), count(c.pending), count(c.other), count(c.total)]),
                ["All channels", count(messages.totals.sent), count(messages.totals.failed), count(messages.totals.pending), count(messages.totals.other), count(messages.totals.total)],
              ],
            }}
          />
        ) : (
          <Empty>No member messages in the last {view.days} days.</Empty>
        )}
      </ChartFrame>
      <ChartFrame title="Team chat alerts" description={`Alerts queued for staff chat over the last ${view.days} days, and the channels organisations have set up.`}>
        <div className="flex flex-col gap-4">
          <StatList
            label="Team chat alert totals"
            items={[
              { label: "Sent", value: count(chat.totals.sent) },
              { label: "Failed", value: count(chat.totals.failed) },
              { label: "Waiting", value: count(chat.totals.pending + chat.totals.retrying + chat.totals.processing) },
            ]}
          />
          {chat.channels.length ? (
            <DataTable
              table={{
                caption: "Team chat channels by kind",
                columns: ["Kind", "Set up", "Switched on", "Failing now"],
                rows: chat.channels.map((c) => [humanise(c.kind), count(c.total), count(c.enabled), count(c.failing)]),
              }}
            />
          ) : (
            <p className="text-label text-ink-muted">No organisation has set up a team chat channel.</p>
          )}
        </div>
      </ChartFrame>
    </div>
  );
}
