import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Notice, Screen, SectionTitle } from '@/components/ui';
import { loadFinance } from '@/services/finance';
import { financeTime, type CoreFinancePayload } from '@/services/finance-model';
import { orderMoney } from '@/services/order-model';
import { colors, space, type } from '@/theme';

export default function FinanceScreen() {
  const router = useRouter();
  const [data, setData] = useState<CoreFinancePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current; setRefreshing(true);
    try {
      const result = await loadFinance();
      if (id === request.current) { setData(result); setError(null); }
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load finance.'); }
    finally { if (id === request.current) setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const s = data?.summary;
  return <Screen refreshing={refreshing} onRefresh={load}>
    <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/(tabs)')} />
    <Text accessibilityRole="header" style={styles.title}>Finance</Text>
    <Notice>Staging · operational reporting. Open order value and invoice receivables can overlap; review them separately.</Notice>
    {error ? <><Notice tone="error">{error}</Notice>{data ? <Notice tone="warning">Showing the previous report from {financeTime(data.generated_at)}. Refresh to get the latest figures.</Notice> : null}<Button label="Retry" variant="secondary" disabled={refreshing} onPress={load} /></> : null}
    {!data && !error ? <Notice>Loading finance…</Notice> : null}
    {s && data ? <>
      <View style={styles.metrics}>
        <Metric label="Paid revenue" value={orderMoney(s.paid_revenue)} detail={`${s.paid_orders} paid orders`} />
        <Metric label="Open order value" value={orderMoney(s.open_order_value)} detail="Orders not recorded as paid" />
        <Metric label="Sent unpaid invoices" value={orderMoney(s.sent_unpaid_invoice_value)} detail="Invoice receivables" />
        <Metric label="Payment review" value={orderMoney(s.payment_review_value)} detail={`${s.payment_review_count} submissions awaiting verification`} />
        <Metric label="Paid / unfulfilled" value={String(s.unfulfilled_paid_orders)} detail={`${s.delivered_paid_orders} delivered paid orders`} />
        <Metric label="Verified payment records" value={orderMoney(s.verified_payment_total)} detail={`${s.verified_payment_records} records · reported separately from paid revenue`} />
      </View>
      <View><SectionTitle>Invoice aging</SectionTitle><Card style={styles.card}>
        {data.aging.length ? data.aging.map((item, index) => <Entry key={`${item.invoice_id}-${index}`} title={item.invoice_number} detail={item.customer_name} amount={orderMoney(item.total)} note={`${item.bucket} · ${item.age_days} days`} />) : <Notice>No invoice aging records.</Notice>}
      </Card></View>
      <View><SectionTitle>Submitted, awaiting verification</SectionTitle><Card style={styles.card}>
        {data.payment_review.length ? data.payment_review.map((item, index) => <Entry key={`${item.id}-${index}`} title={item.customer_name} detail={item.provider || 'Unspecified method'} amount={orderMoney(item.amount)} note={financeTime(item.submitted_at)} />) : <Notice>No submitted payments awaiting review.</Notice>}
        <Button label="Open payments" variant="secondary" onPress={() => router.push('/payments')} />
      </Card></View>
      <View><SectionTitle>Payment method mix</SectionTitle><Card style={styles.card}>
        {data.payment_mix.length ? data.payment_mix.map((item, index) => <Entry key={`${item.method}-${index}`} title={item.method} amount={orderMoney(item.amount)} detail={`${item.count} paid orders`} />) : <Notice>No paid payment-method records.</Notice>}
      </Card></View>
      <View><SectionTitle>Outstanding order value by customer</SectionTitle><Card style={styles.card}>
        {data.unpaid_customers.length ? data.unpaid_customers.map((item, index) => <Entry key={`${item.customer_id}-${index}`} title={item.name} detail={`${item.count} open orders`} amount={orderMoney(item.total)} />) : <Notice>No outstanding customer order records.</Notice>}
        <Button label="Open customers" variant="secondary" onPress={() => router.push('/(tabs)/customers')} />
      </Card></View>
      <View><SectionTitle>Monthly paid revenue</SectionTitle><Card style={styles.card}>
        {data.monthly.length ? data.monthly.map((item, index) => <Entry key={`${item.month}-${index}`} title={item.month} detail={`${item.orders} paid orders`} amount={orderMoney(item.revenue)} />) : <Notice>No monthly paid revenue records.</Notice>}
      </Card></View>
      <Notice>Report generated {financeTime(data.generated_at)}. Figures reflect the records included by the finance service.</Notice>
    </> : null}
  </Screen>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card style={styles.metric}><Text style={styles.caption}>{label}</Text><Text style={styles.value}>{value}</Text><Text style={styles.caption}>{detail}</Text></Card>;
}
function Entry({ title, detail, amount, note }: { title: string; detail?: string; amount: string; note?: string }) {
  return <View style={styles.entry}><Text selectable style={styles.heading}>{title}</Text>{detail ? <Text style={styles.caption}>{detail}</Text> : null}<Text style={styles.amount}>{amount}</Text>{note ? <Text style={styles.caption}>{note}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text }, heading: { ...type.label, color: colors.text }, caption: { ...type.caption, color: colors.textMuted },
  value: { ...type.metric, color: colors.text, fontVariant: ['tabular-nums'] }, amount: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  metrics: { gap: space[3] }, metric: { padding: space[4], gap: space[2] }, card: { padding: space[4], gap: space[4] },
  entry: { gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: space[3] },
});
