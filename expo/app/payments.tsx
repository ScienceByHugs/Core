import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Screen, SectionTitle } from '@/components/ui';
import { enabledTestPayments, loadPayments, recordTestPayment, verifyTestPayment } from '@/services/payments';
import { matchesPayment, paymentProviders, paymentState, type CoreInvoice, type PaymentState } from '@/services/payment-model';
import { orderMoney, statusLabel } from '@/services/order-model';
import { colors, radius, space, touchTarget, type } from '@/theme';

const labels: Record<PaymentState, string> = { blocked: 'Unavailable', waiting: 'Awaiting submission', review: 'Needs verification', paid: 'Paid' };
const time = (value: string | null | undefined) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—';
export default function PaymentsScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<CoreInvoice[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current; setRefreshing(true);
    try {
      const data = await loadPayments();
      if (id !== request.current) return false;
      setInvoices(data); setError(null); return true;
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load payments.'); return false; }
    finally { if (id === request.current) setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const all = invoices ?? [];
  const shown = all.filter(i => matchesPayment(i, query, filter));
  const selected = all.find(i => i.id === selectedId);
  return <>
    <Screen refreshing={refreshing} onRefresh={() => void load()}>
      <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/(tabs)')} />
      <Text accessibilityRole="header" style={styles.title}>Payments</Text>
      <Notice tone="warning">Staging · test records only. Submitted payments are not verified payments.</Notice>
      {!enabledTestPayments ? <Notice>Payment recording and verification are disabled until staging setup is verified.</Notice> : null}
      <TextInput accessibilityLabel="Search payments" placeholder="Invoice, order, customer or reference" placeholderTextColor={colors.textMuted}
        value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <View accessibilityRole="tablist" style={styles.filters}>
        {(['all', 'review', 'waiting', 'paid', 'blocked'] as const).map(f => <Pressable key={f} accessibilityRole="tab"
          accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.active]}>
          <Text style={[styles.caption, filter === f && { color: colors.background }]}>{f === 'all' ? 'All' : labels[f]}</Text>
        </Pressable>)}
      </View>
      {invoices ? <Notice>{shown.length} of {all.length} loaded invoices. Latest 100 only.</Notice> : null}
      {error ? <><Notice tone="error">{error}</Notice>{invoices ? <Notice>Showing previously loaded records.</Notice> : null}<Button label="Retry" onPress={() => void load()} disabled={refreshing} variant="secondary" /></> : null}
      {!invoices && !error ? <Notice>Loading payments…</Notice> : invoices && !all.length ? <Notice>No invoice payment records yet.</Notice> : invoices && !shown.length ? <Notice>No matching payments. Change the search or filter.</Notice> : null}
      {shown.map(invoice => <Pressable key={invoice.id} accessibilityRole="button" accessibilityLabel={`Review payment for ${invoice.invoice_number}`}
        onPress={() => setSelectedId(invoice.id)}><Card style={styles.card}>
          <Text style={styles.heading}>{invoice.invoice_number}</Text>
          <Text style={styles.body}>{invoice.customer_name_snapshot || 'Customer'}</Text>
          <Text style={styles.caption}>{invoice.order?.order_number || 'No order number'}</Text>
          <Text style={styles.amount}>{orderMoney(invoice.total)}</Text>
          <Text style={[styles.caption, { color: paymentState(invoice) === 'review' ? colors.warning : colors.textMuted }]}>{labels[paymentState(invoice)]}</Text>
        </Card></Pressable>)}
    </Screen>
    <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
      {selected ? <PaymentDetail key={selected.id} invoice={selected} refresh={load} close={() => setSelectedId(null)} /> : null}
    </Modal>
  </>;
}
function PaymentDetail({ invoice, refresh, close }: { invoice: CoreInvoice; refresh: () => Promise<boolean>; close: () => void }) {
  const [provider, setProvider] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [mustRefresh, setMustRefresh] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const state = paymentState(invoice);
  const run = async (action: 'record' | 'verify') => {
    if (locked.current || mustRefresh) return;
    locked.current = true; setBusy(true); setMessage(null);
    try {
      if (action === 'record') await recordTestPayment(invoice, provider, reference, notes);
      else await verifyTestPayment(invoice);
      // Do not advertise a paid/processing state until the server is read again.
      setMustRefresh(true);
      if (await refresh()) { setMustRefresh(false); setMessage('Update accepted. Payment state refreshed.'); }
      else setMessage('Update accepted, but the latest state could not be loaded. Refresh before another action.');
    } catch (e) {
      setMustRefresh(true);
      setMessage((e instanceof Error ? e.message : 'Could not confirm the update.') + ' Refresh payment state before retrying.');
    } finally { locked.current = false; setBusy(false); }
  };
  const confirm = (action: 'record' | 'verify') => Alert.alert(
    action === 'verify' ? 'Verify this test payment?' : 'Record this test submission?',
    action === 'verify'
      ? `Invoice ${invoice.invoice_number} · ${orderMoney(invoice.total)}. This marks the staged order paid and starts processing. Confirm only after independently checking the synthetic payment evidence.`
      : `Invoice ${invoice.invoice_number} · ${orderMoney(invoice.total)}. This records a submission for review; it does not move money or mark the order paid.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: action === 'verify' ? 'Verify test payment' : 'Record submission', onPress: () => void run(action) }],
  );
  const reload = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    if (await refresh()) { setMustRefresh(false); setMessage('Payment state refreshed. Review it before continuing.'); }
    else setMessage('Could not refresh. Payment actions remain paused.');
    locked.current = false; setBusy(false);
  };
  return <Screen>
    <Button label="Close payment" variant="secondary" onPress={close} />
    <Text accessibilityRole="header" style={styles.title}>{invoice.invoice_number}</Text>
    <Notice tone="warning">Staging · test records only</Notice>
    <Card style={styles.card}>
      <Field label="Customer" value={invoice.customer_name_snapshot} />
      <Field label="Order" value={invoice.order?.order_number} />
      <Field label="Invoice total" value={orderMoney(invoice.total)} />
      <Field label="Payment amount" value={invoice.payment ? orderMoney(invoice.payment.amount) : 'Not submitted'} />
      <Field label="Payment state" value={labels[state]} />
      <Field label="Order status" value={invoice.order ? statusLabel(invoice.order.status) : null} />
      <Field label="Method" value={invoice.payment?.provider || invoice.order?.payment_method || invoice.payment_method} />
      <Field label="Reference" value={invoice.payment?.payment_reference} />
      <Field label="Submitted" value={time(invoice.payment?.submitted_at)} />
      <Field label="Verified" value={time(invoice.payment?.verified_at)} />
      <Field label="Paid" value={time(invoice.payment?.paid_at || invoice.order?.paid_at)} />
      <Field label="Notes" value={invoice.payment?.notes} />
    </Card>
    {state === 'blocked' ? <Notice>No actions are available for sandbox reservations, cancelled or unlinked orders, or invoices not yet sent.</Notice> : null}
    {state === 'waiting' ? <View style={styles.editor}>
      <SectionTitle>Record test submission</SectionTitle>
      <Notice>Record only a synthetic transaction or confirmation you can reference. This does not move money.</Notice>
      <View accessibilityRole="radiogroup" style={styles.filters}>{paymentProviders.map(p => <Pressable key={p} disabled={busy || !enabledTestPayments || mustRefresh}
        accessibilityRole="radio" accessibilityState={{ checked: p === provider, disabled: busy || !enabledTestPayments || mustRefresh }} onPress={() => setProvider(p)} style={[styles.filter, provider === p && styles.active]}>
        <Text style={[styles.caption, provider === p && { color: colors.background }]}>{p}</Text>
      </Pressable>)}</View>
      <TextInput accessibilityLabel="Payment reference or confirmation" placeholder="Reference / confirmation (optional)" placeholderTextColor={colors.textMuted}
        value={reference} onChangeText={setReference} editable={!busy && enabledTestPayments && !mustRefresh} maxLength={120} style={styles.input} />
      <TextInput accessibilityLabel="Internal payment notes" placeholder="Internal notes (optional)" placeholderTextColor={colors.textMuted}
        value={notes} onChangeText={setNotes} multiline editable={!busy && enabledTestPayments && !mustRefresh} maxLength={300} style={[styles.input, styles.notes]} />
      <Button label="Record test submission" disabled={busy || !enabledTestPayments || mustRefresh || !provider} onPress={() => confirm('record')} />
    </View> : state === 'review' ? <View style={styles.editor}>
      <Notice tone="warning">Submitted is not paid. Check the synthetic payment evidence before verifying.</Notice>
      <Button label="Verify test payment" disabled={busy || !enabledTestPayments || mustRefresh} onPress={() => confirm('verify')} />
    </View> : null}
    {!enabledTestPayments ? <Notice>Payment actions are disabled pending staging verification.</Notice> : null}
    {busy ? <Notice>Working…</Notice> : null}
    {message ? <Notice>{message}</Notice> : null}
    <Button label="Refresh payment state" variant="secondary" disabled={busy} onPress={() => void reload()} />
  </Screen>;
}
function Field({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.field}><Text style={styles.caption}>{label}</Text><Text selectable style={styles.body}>{value || '—'}</Text></View>;
}
const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text }, heading: { ...type.label, color: colors.text },
  body: { ...type.body, color: colors.text }, caption: { ...type.caption, color: colors.textMuted },
  amount: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  card: { padding: space[4], gap: space[3] }, field: { gap: space[1] }, editor: { gap: space[3] },
  input: { minHeight: touchTarget, paddingHorizontal: space[4], borderRadius: radius.control, borderWidth: 1,
    borderColor: colors.controlBorder, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  notes: { minHeight: 90, paddingVertical: space[3], textAlignVertical: 'top' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filter: { minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, justifyContent: 'center' },
  active: { backgroundColor: colors.text, borderColor: colors.text },
});
