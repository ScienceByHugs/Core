import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Screen, SectionTitle } from '@/components/ui';
import { loadOrders, saveDeliveryEstimate } from '@/services/orders';
import { customerName, invoiceUrl, matchesOrder, orderMoney, statusLabel, validDeliveryDate, type CoreOrder } from '@/services/order-model';
import { colors, radius, space, touchTarget, type } from '@/theme';

const statuses = ['all', 'pending', 'processing', 'ordered', 'shipped', 'delayed', 'delivered', 'cancelled'];
const label = (s: string) => s === 'all' ? 'All' : s === 'pending' ? 'Pending sandbox' : statusLabel(s);
const timestamp = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
};
const tone = (s: string) => ['cancelled', 'failed'].includes(s) ? colors.error : ['delayed', 'pending', 'submitted', 'unpaid'].includes(s) ? colors.warning : colors.textMuted;

export default function OrdersScreen() {
  const [orders, setOrders] = useState<CoreOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const result = await loadOrders();
      if (id === request.current) { setOrders(result); setError(null); }
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load orders.');
    } finally { if (id === request.current) setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current++; };
  }, [load]));
  const all = orders ?? [];
  const shown = all.filter(o => matchesOrder(o, query, status));
  const selected = all.find(o => o.id === selectedId);
  return <>
    <Screen refreshing={refreshing} onRefresh={load}>
      <Text accessibilityRole="header" style={styles.title}>Orders</Text>
      <TextInput accessibilityLabel="Search orders" placeholder="Order, customer, email or reference" placeholderTextColor={colors.textMuted}
        value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <View accessibilityRole="tablist" style={styles.filters}>
        {statuses.map(s => <Pressable key={s} accessibilityRole="tab" accessibilityState={{ selected: status === s }}
          onPress={() => setStatus(s)} style={[styles.filter, status === s && styles.active]}>
          <Text style={[styles.caption, status === s && { color: colors.background }]}>{label(s)}</Text>
        </Pressable>)}
      </View>
      <Notice>Showing {shown.length} of {all.length} loaded orders. Latest 100 only.</Notice>
      {error ? <><Notice tone="error">{error}</Notice>{orders ? <Notice>Showing previously loaded orders.</Notice> : null}<Button label="Retry" onPress={load} disabled={refreshing} variant="secondary" /></> : null}
      {!orders && !error ? <Notice>Loading orders…</Notice> : orders && !all.length ? <Notice>No orders yet.</Notice> : orders && !shown.length ? <Notice>No matching orders. Change the filter or search.</Notice> : null}
      {shown.map(order => <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Open ${order.order_number || 'unnumbered order'} for ${customerName(order)}`}
        onPress={() => setSelectedId(order.id)}>
        <Card style={styles.card}>
          <Text style={styles.heading}>{order.order_number || 'Unnumbered order'}</Text>
          <Text style={styles.body}>{customerName(order)}</Text>
          <Text style={styles.caption}>{order.customer?.email || 'No email recorded'}</Text>
          <Text style={styles.amount}>{orderMoney(order.total)}</Text>
          <Text style={[styles.caption, { color: tone(order.status) }]}>Order: {statusLabel(order.status)}</Text>
          <Text style={[styles.caption, { color: tone(order.payment_status) }]}>Payment: {statusLabel(order.payment_status)}</Text>
        </Card>
      </Pressable>)}
    </Screen>
    <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
      {selected ? <OrderDetail key={selected.id} order={selected} close={() => setSelectedId(null)}
        saved={patch => { request.current++; setRefreshing(false); setOrders(current => current?.map(o => o.id === patch.id ? { ...o, ...patch } : o) ?? null); }} /> : null}
    </Modal>
  </>;
}

function OrderDetail({ order, close, saved }: { order: CoreOrder; close: () => void; saved: (patch: Pick<CoreOrder, 'id' | 'estimated_delivery_date' | 'updated_at'>) => void }) {
  const [date, setDate] = useState(order.estimated_delivery_date || '');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const save = async (clear: boolean) => {
    if (busy.current) return;
    const value = clear ? null : date.trim();
    if (value !== null && !validDeliveryDate(value)) { setFailed(true); setMessage('Enter a valid date as YYYY-MM-DD, or clear the estimate.'); return; }
    busy.current = true; setSaving(true); setMessage(null); setFailed(false);
    try {
      const patch = await saveDeliveryEstimate(order.id, value);
      saved(patch); setDate(patch.estimated_delivery_date || '');
      setMessage(patch.estimated_delivery_date ? 'Saved. This estimate is visible in nexus.' : 'Cleared. No estimated date is shown in nexus.');
    } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Could not save the estimate.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const pdf = invoiceUrl(order.invoice?.pdf_url);
  const openInvoice = async () => {
    if (!pdf) return;
    try { await Linking.openURL(pdf); }
    catch { setFailed(true); setMessage('Could not open the invoice. Try again.'); }
  };
  return <Screen>
    <Button label="Close order" onPress={close} variant="secondary" />
    <Text accessibilityRole="header" style={styles.title}>{order.order_number || 'Unnumbered order'}</Text>
    <Card style={styles.card}>
      <Text style={styles.heading}>{customerName(order)}</Text>
      <Field label="Customer number" value={order.customer?.customer_number} />
      <Field label="Email" value={order.customer?.email} />
      <Field label="Phone" value={order.customer?.phone} />
      <Field label="Order status" value={statusLabel(order.status)} />
      <Field label="Payment status" value={statusLabel(order.payment_status)} />
      <Field label="Payment method" value={order.payment_method || order.payment?.provider} />
      <Field label="Payment reference" value={order.payment?.payment_reference} />
      <Field label="Contact method" value={order.contact_method || order.customer?.preferred_contact_method} />
    </Card>
    <View><SectionTitle>Items</SectionTitle><Card style={styles.card}>
      {order.items.length ? order.items.map(item => <View key={item.id} style={styles.item}>
        <Text style={styles.body}>{item.product_name}</Text>
        {item.product_code ? <Text style={styles.caption}>{item.product_code}</Text> : null}
        <Text style={styles.caption}>{item.quantity} × {orderMoney(item.unit_price)}</Text>
        <Text style={styles.amount}>{orderMoney(item.line_total)}</Text>
      </View>) : <Notice>No line items available.</Notice>}
      <Field label="Subtotal" value={orderMoney(order.subtotal)} />
      <Field label="Discount" value={orderMoney(order.discount_total)} />
      <Field label="Shipping" value={orderMoney(order.shipping_total)} />
      <Field label="Tax" value={orderMoney(order.tax_total)} />
      <Field label="Total" value={orderMoney(order.total)} />
    </Card></View>
    <View><SectionTitle>Delivery estimate</SectionTitle>
      {order.payment_method === 'sandbox' ? <Notice tone="warning">Sandbox reservation. No payment was collected and no fulfillment will be dispatched. Cancel pending sandbox orders in nexus to release reserved stock.</Notice> : <View style={styles.editor}>
        <Text style={styles.caption}>Estimated date · YYYY-MM-DD</Text>
        <TextInput accessibilityLabel="Estimated delivery date, YYYY-MM-DD" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted} editable={!saving} autoCapitalize="none" autoCorrect={false} maxLength={10} style={styles.input} />
        <Notice>Saving or clearing changes the date shown in the customer’s nexus account.</Notice>
        <Button label={saving ? 'Saving…' : 'Save date'} disabled={saving} onPress={() => void save(false)} />
        <Button label="Clear date" disabled={saving || !order.estimated_delivery_date} variant="secondary" onPress={() => void save(true)} />
      </View>}
    </View>
    {message ? <Notice tone={failed ? 'error' : 'muted'}>{message}</Notice> : null}
    <View><SectionTitle>History</SectionTitle><Card style={styles.card}>
      {([['Submitted', order.submitted_at || order.created_at], ['Paid', order.paid_at], ['Ordered', order.ordered_at],
        ['Shipped', order.shipped_at], ['Delivered', order.delivered_at], ['Delayed', order.delayed_at], ['Cancelled', order.cancelled_at],
        ['Completed', order.completed_at], ['Updated', order.updated_at]] as const).filter(([, value]) => value).map(([title, value]) => <Field key={title} label={title} value={timestamp(value)} />)}
    </Card></View>
    {order.invoice ? <View><SectionTitle>Invoice</SectionTitle><Card style={styles.card}>
      <Field label="Number" value={order.invoice.invoice_number} />
      <Field label="Status" value={order.invoice.status} />
      <Field label="PDF" value={order.invoice.pdf_status || 'Not available'} />
      {pdf ? <Button label="Open invoice PDF" variant="secondary" onPress={() => void openInvoice()} /> : <Notice>Invoice PDF is not available.</Notice>}
    </Card></View> : null}
    {([['Customer note', order.customer_notes], ['Fulfillment note', order.fulfillment_note], ['Admin note', order.admin_notes]] as const).map(([title, value]) => value ? <View key={title}><SectionTitle>{title}</SectionTitle><Text selectable style={styles.body}>{value}</Text></View> : null)}
  </Screen>;
}
function Field({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.field}><Text style={styles.caption}>{label}</Text><Text selectable style={styles.body}>{value || '—'}</Text></View>;
}
const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  heading: { ...type.label, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.caption, color: colors.textMuted },
  amount: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  card: { padding: space[4], gap: space[3] },
  item: { gap: space[1], borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: space[3] },
  field: { gap: space[1] },
  editor: { gap: space[3] },
  input: { minHeight: touchTarget, borderRadius: radius.control, borderWidth: 1, borderColor: colors.controlBorder,
    backgroundColor: colors.surface, color: colors.text, paddingHorizontal: space[4], fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filter: { minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, justifyContent: 'center' },
  active: { backgroundColor: colors.text, borderColor: colors.text },
});
