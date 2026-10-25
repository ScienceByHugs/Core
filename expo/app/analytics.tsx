import { useState } from "react";
import { Text, View } from "react-native";
import { Notice } from "@/components/ui";
import {
  Choices,
  Field,
  Group,
  Workspace,
  useWorkspace,
  ws,
} from "@/components/workspace";
import { loadAnalytics } from "@/services/workspaces";
import { analyticsDays, type Range } from "@/services/workspace-models";
import { orderMoney } from "@/services/order-model";
import { financeTime } from "@/services/finance-model";
export default function Analytics() {
  const state = useWorkspace(loadAnalytics),
    d = state.data;
  const [range, setRange] = useState<Range>("30");
  const p = d?.periods[range];
  return (
    <Workspace title="Analytics" state={state}>
      {d && p ? (
        <>
          <Group title="All-time overview">
            {Object.entries(d.headline).map(([key, value]) => (
              <Field
                key={key}
                label={key.replaceAll("_", " ")}
                value={
                  ["paid_revenue", "average_paid_order"].includes(key)
                    ? orderMoney(value)
                    : value
                }
              />
            ))}
          </Group>
          <Choices
            label="Reporting period"
            options={[
              ["7", "7 days"],
              ["30", "30 days"],
              ["90", "90 days"],
              ["all", "All time"],
            ]}
            value={range}
            change={(v) => setRange(v as Range)}
          />
          <Group title="Period performance">
            <Field label="Revenue" value={orderMoney(p.revenue)} />
            <Field
              label="Orders / paid"
              value={`${p.orders} / ${p.paid_orders}`}
            />
            <Field label="Average order" value={orderMoney(p.average_order)} />
            <Field
              label="New / purchasing / repeat customers"
              value={`${p.new_customers} / ${p.purchasing_customers} / ${p.repeat_customers}`}
            />
          </Group>
          <Group title="Daily trend">
            {range === "all" ? (
              <Notice>
                All-time KPIs above; daily history covers the latest 90 days.
              </Notice>
            ) : null}
            {analyticsDays(d.series.daily_90, range).length ? (
              analyticsDays(d.series.daily_90, range).map((day, i) => (
                <View key={day.date + i} style={ws.entry}>
                  <Text style={ws.heading}>{day.label}</Text>
                  <Text style={ws.amount}>{orderMoney(day.revenue)}</Text>
                  <Text style={ws.caption}>
                    {day.orders} orders · {day.paid_orders} paid ·{" "}
                    {day.new_customers} new customers
                  </Text>
                </View>
              ))
            ) : (
              <Notice>No daily records.</Notice>
            )}
          </Group>
          <Group title="Top customers">
            {d.customers.top_customers.length ? (
              d.customers.top_customers.map((c, i) => (
                <Field
                  key={c.customer_id + i}
                  label={`${i + 1}. ${c.name} · ${c.paid_orders} paid orders`}
                  value={orderMoney(c.revenue)}
                />
              ))
            ) : (
              <Notice>No customer rankings.</Notice>
            )}
          </Group>
          <Group title="Top paid products">
            {d.products.top_products.length ? (
              d.products.top_products.map((p, i) => (
                <Field
                  key={p.product_id + i}
                  label={`${i + 1}. ${p.name} · ${p.quantity} units · ${p.orders} orders`}
                  value={orderMoney(p.revenue)}
                />
              ))
            ) : (
              <Notice>No product rankings.</Notice>
            )}
          </Group>
          <Group title="Payment mix">
            {d.orders.payment_mix.map((p, i) => (
              <Field
                key={p.method + i}
                label={`${p.method} · ${p.count} orders`}
                value={orderMoney(p.revenue)}
              />
            ))}
            {!d.orders.payment_mix.length ? (
              <Notice>No payment mix.</Notice>
            ) : null}
          </Group>
          <Group title="Membership mix">
            {d.customers.membership_mix.map((m, i) => (
              <Field
                key={m.membership + i}
                label={m.membership}
                value={m.count}
              />
            ))}
            {!d.customers.membership_mix.length ? (
              <Notice>No membership records.</Notice>
            ) : null}
          </Group>
          <Group title="Referral funnel">
            {Object.entries(d.referrals).map(([key, value]) => (
              <Field
                key={key}
                label={key.replaceAll("_", " ")}
                value={key.endsWith("_rate") ? `${value}%` : value}
              />
            ))}
          </Group>
          <Group title="Order status mix">
            {d.orders.status_mix.map((s, i) => (
              <Field
                key={s.status + i}
                label={s.status.replaceAll("_", " ")}
                value={s.count}
              />
            ))}
            {!d.orders.status_mix.length ? (
              <Notice>No order status records.</Notice>
            ) : null}
          </Group>
          <Notice>
            Report generated {financeTime(d.generated_at)}. Totals and ranking
            coverage are supplied by the analytics service.
          </Notice>
        </>
      ) : null}
    </Workspace>
  );
}
