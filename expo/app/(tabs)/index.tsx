import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Notice, Row, Screen, SectionTitle, Wordmark, money } from '@/components/ui';
import { loadDashboard, type CoreDashboard } from '@/services/dashboard';
import { colors, space, type } from '@/theme';

function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const statusLabel = (order: CoreDashboard['operations']['recent_orders'][number]) => {
  const pay = order.payment_status?.toLowerCase();
  if (pay === 'paid' || pay === 'verified') return { text: 'Paid', color: colors.success };
  if (pay === 'submitted') return { text: 'Verify payment', color: colors.warning };
  if (order.status?.toLowerCase() === 'cancelled') return { text: 'Cancelled', color: colors.textMuted };
  return { text: 'Awaiting payment', color: colors.warning };
};

export default function Home() {
  const [data, setData] = useState<CoreDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await loadDashboard());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const a = data?.attention;
  const attention = a
    ? [
        { label: 'Verify payments', count: a.payment_submitted, dot: colors.warning },
        { label: 'Invoices to approve', count: a.awaiting_invoice_approval, dot: colors.warning },
        { label: 'Invoices ready to send', count: a.ready_to_send, dot: colors.accent },
        { label: 'Delayed orders', count: a.delayed_orders, dot: colors.error },
        { label: 'Products missing a COA', count: a.missing_coa, dot: colors.error },
      ].filter(item => item.count > 0)
    : [];
  const b = data?.business;
  const repeatShare = b && b.customers > 0 ? Math.round((b.repeat_customers / b.customers) * 100) : null;
  const orders = data?.operations.recent_orders.slice(0, 5) ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Wordmark />
      <View style={{ gap: space[1] }}>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
        <Text style={styles.title}>{greeting()}</Text>
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View>
        <SectionTitle>Needs attention</SectionTitle>
        <Card>
          {!data ? (
            <Row title={refreshing ? 'Loading…' : 'Not loaded'} last />
          ) : attention.length === 0 ? (
            <Row title="All caught up" detail="Nothing needs action right now." last />
          ) : (
            attention.map((item, i) => (
              <Row key={item.label} title={item.label} trailing={String(item.count)} dot={item.dot} last={i === attention.length - 1} />
            ))
          )}
        </Card>
      </View>

      {b ? (
        <View>
          <SectionTitle>Last 7 days</SectionTitle>
          <View style={styles.grid}>
            <Kpi label="Revenue" value={money(b.revenue_7d)} />
            <Kpi label="Orders" value={String(b.orders_7d)} />
            <Kpi label="Average order" value={money(b.average_paid_order)} note="All paid orders" />
            <Kpi label="Repeat customers" value={repeatShare === null ? '—' : `${repeatShare}%`} note={`${b.repeat_customers} of ${b.customers}`} />
          </View>
        </View>
      ) : null}

      {orders.length ? (
        <View>
          <SectionTitle>Recent orders</SectionTitle>
          <Card>
            {orders.map((order, i) => {
              const status = statusLabel(order);
              return (
                <Row
                  key={order.id}
                  title={order.order_number ?? 'Order'}
                  detail={new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  trailing={money(order.total)}
                  trailingDetail={status.text}
                  last={i === orders.length - 1}
                />
              );
            })}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {note ? <Text style={styles.kpiNote}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  date: { ...type.caption, color: colors.textMuted, fontSize: 13 },
  title: { ...type.title, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  kpi: { flexGrow: 1, flexBasis: '45%', padding: space[4], gap: space[1] },
  kpiLabel: { ...type.caption, color: colors.textMuted, fontSize: 13 },
  kpiValue: { ...type.metric, color: colors.text },
  kpiNote: { ...type.caption, color: colors.textMuted },
});
