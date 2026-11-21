import type { SuperAdminMoneyView } from "@/lib/views/app__super-admin__analytics__growth";
import { formatAmount } from "@/lib/reports/money";
import { ChartFrame } from "@/components/reports/charts/ChartFrame";
import { StackedColumnChart } from "@/components/reports/charts/StackedColumnChart";
import { previousLabel } from "./AnalyticsShell";
import { currencyName } from "./format";
import { ComparedTile, Empty, Section, tileGrid } from "./parts";

type CurrencyMoney = SuperAdminMoneyView["currencies"][number];

function CurrencySection({ money, view }: { money: CurrencyMoney; view: SuperAdminMoneyView }) {
  const { currency, comparison: c, points } = money;
  const kind = `money:${currency}` as const;
  const vs = previousLabel(view.range);
  const per = view.unit === "day" ? "day" : "month";
  const amount = (minor: number) => formatAmount(minor, currency);
  const id = `money-${currency.toLowerCase()}`;
  return (
    <Section id={id} title={currencyName(currency)} description={`${money.payments.toLocaleString("en-IN")} ${money.payments === 1 ? "payment" : "payments"} in ${currency} across every organisation, ${view.label.toLowerCase()}.`}>
      <div className={tileGrid}>
        <ComparedTile label="Collected" comparison={c.collected} kind={kind} vs={vs} />
        <ComparedTile label="Refunds" comparison={c.refunds} kind={kind} vs={vs} higherIsBetter={false} />
        <ComparedTile label="Net" comparison={c.net} kind={kind} vs={vs} hint="Collected less refunds" />
        <ComparedTile label="Online" comparison={c.online} kind={kind} vs={vs} hint="Through a payment gateway" />
        <ComparedTile label="In hand" comparison={c.inHand} kind={kind} vs={vs} hint="Paid offline and recorded by staff" />
        <ComparedTile label="Outstanding now" value={amount(money.outstanding)} hint="Owed today, whatever the range: not compared" />
      </div>
      <ChartFrame
        title={`Collected and refunded each ${per}, ${currency}`}
        description="Online and in hand stack to what was collected; refunds sit beside them, by the date they were made."
        table={{ columns: [view.unit === "day" ? "Day" : "Month", "Online", "In hand", "Collected", "Refunds", "Net"], rows: points.map((p) => [p.label, amount(p.online), amount(p.inHand), amount(p.collected), amount(p.refunds), amount(p.net)]) }}
      >
        {points.some((p) => p.collected > 0 || p.refunds > 0) ? (
          <StackedColumnChart
            ariaLabel={`Money collected online and in hand, and refunds, each ${per} in ${currency}`}
            format={kind}
            labels={points.map((p) => p.label)}
            columns={[
              [{ key: "online", label: "Online", slot: 1, values: points.map((p) => p.online) }, { key: "inHand", label: "In hand", slot: 2, values: points.map((p) => p.inHand) }],
              [{ key: "refunds", label: "Refunds", slot: 3, values: points.map((p) => p.refunds) }],
            ]}
          />
        ) : (
          <Empty>Nothing collected or refunded in {currency} in this range.</Empty>
        )}
      </ChartFrame>
    </Section>
  );
}

/**
 * Money across the platform, one section per currency (the largest first). Amounts are never added across
 * currencies or converted; each section's figures are set against the previous period of the same length.
 */
export function MoneySections({ view }: { view: SuperAdminMoneyView }) {
  if (!view.currencies.length) {
    return (
      <ChartFrame title="Money" description={view.label}>
        <Empty>No payments in this range.</Empty>
      </ChartFrame>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {view.currencies.map((money) => <CurrencySection key={money.currency} money={money} view={view} />)}
    </div>
  );
}
