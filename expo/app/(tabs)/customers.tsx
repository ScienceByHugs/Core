import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Screen, SectionTitle } from '@/components/ui';
import { customerDisplayName, matchesCustomer, profileDraft, profileFields, type CoreCustomer, type CoreCustomersWorkspace } from '@/services/customer-model';
import { loadCustomers, saveContactPreference, saveCustomerNotes, saveCustomerProfile, type CustomerPatch } from '@/services/customers';
import { recordEditsEnabled, recordEditsOffMessage } from '@/services/write-gate';
import { orderMoney, statusLabel } from '@/services/order-model';
import { colors, radius, space, touchTarget, type } from '@/theme';

const dateTime = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
};
export default function CustomersScreen() {
  const [workspace, setWorkspace] = useState<CoreCustomersWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [membership, setMembership] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const data = await loadCustomers();
      if (id === request.current) { setWorkspace(data); setError(null); }
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load customers.'); }
    finally { if (id === request.current) setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const all = workspace?.customers ?? [];
  const shown = all.filter(c => matchesCustomer(c, query, membership));
  const selected = all.find(c => c.id === selectedId);
  const saved = (patch: CustomerPatch) => {
    request.current++; setRefreshing(false);
    setWorkspace(current => current ? { ...current, customers: current.customers.map(c => c.id === patch.id ? { ...c, ...patch } : c) } : null);
  };
  return <>
    <Screen refreshing={refreshing} onRefresh={load}>
      <Text accessibilityRole="header" style={styles.title}>Customers</Text>
      <TextInput accessibilityLabel="Search customers" placeholder="Name, email, phone or customer number" placeholderTextColor={colors.textMuted}
        value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <View accessibilityRole="tablist" style={styles.filters}>
        {[{ slug: 'all', name: 'All memberships' }, ...(workspace?.memberships ?? [])].map(m => <Pressable key={m.slug}
          accessibilityRole="tab" accessibilityState={{ selected: membership === m.slug }} onPress={() => setMembership(m.slug)}
          style={[styles.filter, membership === m.slug && styles.active]}>
          <Text style={[styles.caption, membership === m.slug && { color: colors.background }]}>{m.name}</Text>
        </Pressable>)}
      </View>
      {workspace ? <Notice>{shown.length} of {all.length} loaded customers shown.</Notice> : null}
      {error ? <><Notice tone="error">{error}</Notice>{workspace ? <Notice>Showing previously loaded customers.</Notice> : null}<Button label="Retry" variant="secondary" onPress={load} disabled={refreshing} /></> : null}
      {!workspace && !error ? <Notice>Loading customers…</Notice> : workspace && !all.length ? <Notice>No customers yet.</Notice> : workspace && !shown.length ? <Notice>No matching customers. Change the search or membership filter.</Notice> : null}
      {shown.map(customer => <Pressable key={customer.id} accessibilityRole="button" accessibilityLabel={`Open ${customerDisplayName(customer)}`}
        onPress={() => setSelectedId(customer.id)}><Card style={styles.card}>
        <Text style={styles.heading}>{customerDisplayName(customer)}</Text>
        <Text style={styles.caption}>{customer.customer_number || 'No customer number'}</Text>
        <Text style={styles.body}>{customer.email}</Text>
        <Text style={styles.caption}>{customer.membership?.name || 'No membership'} · {customer.account_status}</Text>
        <Text style={styles.metric}>{customer.metrics.order_count} orders · {orderMoney(customer.metrics.lifetime_spend)}</Text>
      </Card></Pressable>)}
    </Screen>
    <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
      {selected ? <CustomerDetail key={selected.id} customer={selected} saved={saved} close={() => setSelectedId(null)} /> : null}
    </Modal>
  </>;
}
function CustomerDetail({ customer, saved, close }: { customer: CoreCustomer; saved: (patch: CustomerPatch) => void; close: () => void }) {
  const [draft, setDraft] = useState(() => profileDraft(customer));
  const [notes, setNotes] = useState(customer.notes || '');
  const [method, setMethod] = useState(customer.preferred_contact_method?.toLowerCase() === 'sms' ? 'text' : customer.preferred_contact_method || '');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const save = async (work: () => Promise<CustomerPatch>, kind: 'profile' | 'notes' | 'contact') => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(null); setFailed(false);
    try {
      const patch = await work(); saved(patch);
      if (kind === 'profile') setDraft(profileDraft({ ...customer, ...patch }));
      if (kind === 'notes') setNotes(patch.notes || '');
      if (kind === 'contact') setMethod(patch.preferred_contact_method || '');
      setMessage('Saved.');
    } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { locked.current = false; setBusy(false); }
  };
  return <Screen>
    <Button label="Close customer" variant="secondary" onPress={close} />
    <Text accessibilityRole="header" style={styles.title}>{customerDisplayName(customer)}</Text>
    <Card style={styles.card}>
      <Field label="Customer number" value={customer.customer_number} />
      <Field label="Email / login" value={customer.email} />
      <Field label="Membership" value={customer.membership?.name} />
      <Field label="Account" value={customer.account_status} />
      <Field label="Orders" value={`${customer.metrics.order_count} · ${customer.metrics.paid_order_count} paid`} />
      <Field label="Lifetime spend" value={orderMoney(customer.metrics.lifetime_spend)} />
      <Field label="Last login" value={dateTime(customer.last_login_at)} />
      <Field label="Latest order" value={dateTime(customer.metrics.latest_order_at)} />
      <Field label="Referral code" value={customer.referral_code} />
    </Card>
    <Notice>Membership, account status and login-email changes are in Admin tools.</Notice>
    {!recordEditsEnabled ? <Notice tone="warning">{recordEditsOffMessage}</Notice> : null}
    <View><SectionTitle>Profile</SectionTitle><View style={styles.editor}>
      {profileFields.map(([key, label, , limit]) => <View key={key} style={styles.field}>
        <Text style={styles.caption}>{label}</Text>
        <TextInput accessibilityLabel={label} value={draft[key]} onChangeText={value => setDraft(current => ({ ...current, [key]: value }))}
          editable={!busy && recordEditsEnabled} maxLength={limit} keyboardType={key === 'phone' ? 'phone-pad' : 'default'} style={styles.input} />
      </View>)}
      <Button label="Save profile" disabled={busy || !recordEditsEnabled} onPress={() => void save(() => saveCustomerProfile(customer.id, draft), 'profile')} />
    </View></View>
    <View><SectionTitle>Preferred contact</SectionTitle><View style={styles.editor}>
      <View accessibilityRole="radiogroup" style={styles.filters}>
        {[['', 'Not set'], ['email', 'Email'], ['phone', 'Phone'], ['text', 'Text']].map(([value, label]) => <Pressable key={value}
          accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: method === value, disabled: busy || !recordEditsEnabled }} disabled={busy || !recordEditsEnabled}
          onPress={() => setMethod(value || '')} style={[styles.filter, method === value && styles.active]}>
          <Text style={[styles.caption, method === value && { color: colors.background }]}>{label}</Text>
        </Pressable>)}
      </View>
      <Button label="Save contact preference" disabled={busy || !recordEditsEnabled} variant="secondary" onPress={() => void save(() => saveContactPreference(customer.id, method || null), 'contact')} />
    </View></View>
    <View><SectionTitle>Internal notes</SectionTitle><View style={styles.editor}>
      <TextInput accessibilityLabel="Internal customer notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} editable={!busy && recordEditsEnabled}
        style={[styles.input, styles.notes]} textAlignVertical="top" />
      <Notice>{notes.length} / 2000 characters</Notice>
      <Button label="Save notes" variant="secondary" disabled={busy || !recordEditsEnabled} onPress={() => void save(() => saveCustomerNotes(customer.id, notes), 'notes')} />
    </View></View>
    {busy ? <Notice>Saving…</Notice> : null}
    {message ? <Notice tone={failed ? 'error' : 'muted'}>{message}</Notice> : null}
    <View><SectionTitle>Order history</SectionTitle><Card style={styles.card}>
      {customer.orders.length ? customer.orders.map(order => <View key={order.id} style={styles.entry}>
        <Text style={styles.heading}>{order.order_number || 'Unnumbered order'}</Text>
        <Text style={styles.caption}>Order: {statusLabel(order.status)} · Payment: {statusLabel(order.payment_status)}</Text>
        <Text style={styles.metric}>{orderMoney(order.total)}</Text>
        <Text style={styles.caption}>{dateTime(order.created_at)}</Text>
      </View>) : <Notice>No orders recorded.</Notice>}
    </Card></View>
    <View><SectionTitle>Referrals</SectionTitle><Card style={styles.card}>
      <Field label="Referrals / qualified" value={`${customer.metrics.referral_count} / ${customer.metrics.qualified_referral_count}`} />
      {customer.referrals.length ? customer.referrals.map(referral => <View key={referral.id} style={styles.entry}>
        <Text style={styles.body}>{referral.referred_name || referral.referred_email || 'Referred customer'}</Text>
        <Text style={styles.caption}>{statusLabel(referral.status)} · {dateTime(referral.referred_at)}</Text>
        {referral.qualifying_order_number ? <Field label="Qualifying order" value={referral.qualifying_order_number} /> : null}
      </View>) : <Notice>No referrals recorded.</Notice>}
    </Card></View>
    <View><SectionTitle>Rewards</SectionTitle><Card style={styles.card}>
      <Field label="Available rewards" value={String(customer.metrics.available_reward_count)} />
      {customer.rewards.length ? customer.rewards.map(reward => <View key={reward.id} style={styles.entry}>
        <Text style={styles.body}>{reward.title || statusLabel(reward.reward_type)}</Text>
        <Text style={styles.caption}>{statusLabel(reward.status)}</Text>
        {reward.description ? <Text style={styles.caption}>{reward.description}</Text> : null}
        {reward.expires_at ? <Field label="Expires" value={dateTime(reward.expires_at)} /> : null}
      </View>) : <Notice>No rewards recorded.</Notice>}
    </Card></View>
  </Screen>;
}
function Field({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.field}><Text style={styles.caption}>{label}</Text><Text selectable style={styles.body}>{value || '—'}</Text></View>;
}
const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text }, heading: { ...type.label, color: colors.text },
  body: { ...type.body, color: colors.text }, caption: { ...type.caption, color: colors.textMuted },
  metric: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  card: { padding: space[4], gap: space[3] }, field: { gap: space[1] }, editor: { gap: space[3] },
  entry: { gap: space[2], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[3] },
  input: { minHeight: touchTarget, paddingHorizontal: space[4], borderRadius: radius.control, borderWidth: 1,
    borderColor: colors.controlBorder, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  notes: { minHeight: 120, paddingVertical: space[3] },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filter: { minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, justifyContent: 'center' },
  active: { backgroundColor: colors.text, borderColor: colors.text },
});
