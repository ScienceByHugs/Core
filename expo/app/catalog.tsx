import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Screen, SectionTitle } from '@/components/ui';
import { adjustStock, loadCatalog, loadProductHistory, saveCategory, saveProduct, savePublication, type CatalogEvent, type CatalogWorkspace } from '@/services/catalog';
import { matchesProduct, productDraft, productFields, type CoreCatalogCategory, type ManagedProduct, type PublicationState, type Verification } from '@/services/catalog-model';
import { orderMoney } from '@/services/order-model';
import { recordEditsEnabled, recordEditsOffMessage } from '@/services/write-gate';
import { colors, radius, space, touchTarget, type } from '@/theme';

type Editor = { mode: 'product' | 'stock' | 'publication' | 'history'; product?: ManagedProduct } | { mode: 'category'; category?: CoreCatalogCategory };
export default function CatalogScreen() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<CatalogWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current; setRefreshing(true);
    try { const data = await loadCatalog(); if (id !== request.current) return false; setWorkspace(data); setError(null); return true; }
    catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load catalog.'); return false; }
    finally { if (id === request.current) setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const all = workspace?.products ?? [];
  const categories = workspace?.categories ?? [];
  const shown = all.filter(p => matchesProduct(p, query, category, state));
  return <>
    <Screen refreshing={refreshing} onRefresh={() => void load()}>
      <Button label="Back to inventory" variant="secondary" onPress={() => router.replace('/(tabs)/inventory')} />
      <Text accessibilityRole="header" style={styles.title}>Catalog</Text>
      <Notice>Staging · drafts and unverified products stay unpublished. Package size is separate from stock.</Notice>
      {!recordEditsEnabled ? <Notice tone="warning">{recordEditsOffMessage}</Notice> : null}
      <Button label="Create draft product" disabled={!workspace} onPress={() => setEditor({ mode: 'product' })} />
      <View style={styles.editor}><SectionTitle>Categories</SectionTitle>
        <Button label="New category" variant="secondary" disabled={!workspace} onPress={() => setEditor({ mode: 'category' })} />
        <View style={styles.filters}>{categories.map(c => <Button key={c.id} label={`Edit ${c.name}${c.active ? '' : ' (inactive)'}`} variant="secondary" onPress={() => setEditor({ mode: 'category', category: c })} />)}</View>
      </View>
      <TextInput accessibilityLabel="Search catalog" placeholder="Name, SKU or package size" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <Choices label="Filter category" options={[['', 'All categories'], ...categories.map(c => [c.id, c.name] as [string, string])]} value={category} change={setCategory} />
      <Choices label="Filter state" options={['', 'draft', 'review', 'published', 'archived', 'low', 'out', 'unknown'].map(s => [s, s || 'All states'])} value={state} change={setState} />
      {workspace ? <Notice>{shown.length} of {all.length} loaded products. Up to 500 products.</Notice> : null}
      {error ? <><Notice tone="error">{error}</Notice>{workspace ? <Notice>Showing previously loaded products.</Notice> : null}<Button label="Retry" variant="secondary" disabled={refreshing} onPress={() => void load()} /></> : null}
      {!workspace && !error ? <Notice>Loading catalog…</Notice> : workspace && !shown.length ? <Notice>No matching products. Create a draft or change the filters.</Notice> : null}
      {shown.map(product => <Card key={product.id} style={styles.card}>
        <Text style={styles.heading}>{product.name}</Text><Text style={styles.caption}>{product.sku || 'SKU required'} · {product.quantity || 'No variant label'}</Text>
        <Text style={styles.caption}>{product.category?.name || 'Uncategorized'} · {product.publication_status || 'draft'}{product.is_synthetic ? ' · synthetic' : ''}</Text>
        <Text style={styles.amount}>{orderMoney(product.price)}</Text>
        <Text style={styles.caption}>On hand: {product.inventory?.stock_on_hand ?? 'Unknown'} · Reserved: {product.inventory?.reserved_quantity ?? 0} · Available: {product.inventory?.available_to_sell ?? 'Unknown'}</Text>
        <View style={styles.editor}>{(['product', 'stock', 'publication', 'history'] as const).map(mode => <Button key={mode} label={{ product: 'Edit product', stock: 'Adjust stock', publication: 'Review publication', history: 'History' }[mode]} variant="secondary" onPress={() => setEditor({ mode, product })} />)}</View>
      </Card>)}
    </Screen>
    <Modal visible={Boolean(editor)} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setEditor(null)}>
      {editor ? <CatalogEditor editor={editor} categories={categories} close={() => setEditor(null)} refresh={load} /> : null}
    </Modal>
  </>;
}
function CatalogEditor({ editor, categories, close, refresh }: { editor: Editor; categories: CoreCatalogCategory[]; close: () => void; refresh: () => Promise<boolean> }) {
  const product = editor.mode === 'category' ? undefined : editor.product;
  const category = editor.mode === 'category' ? editor.category : undefined;
  const [draft, setDraft] = useState(() => productDraft(product));
  const [stock, setStock] = useState(product?.inventory?.stock_on_hand == null ? '' : String(product.inventory.stock_on_hand));
  const [threshold, setThreshold] = useState(String(product?.inventory?.low_stock_threshold ?? 0));
  const [reason, setReason] = useState('');
  const [publication, setPublication] = useState<PublicationState>(product?.publication_status || 'draft');
  const [verification, setVerification] = useState<Verification>({ authenticity: false, eligibility: false, imagery: false, evidence: product?.verification_evidence || '' });
  const [catName, setCatName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [description, setDescription] = useState(category?.description || '');
  const [active, setActive] = useState(category?.active ?? true);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  useEffect(() => {
    if (editor.mode !== 'history' || !product) return;
    let mounted = true;
    setBusy(true); setMessage(null);
    void loadProductHistory(product.id).then(result => { if (mounted) { setEvents(result); setFailed(false); } })
      .catch(e => { if (mounted) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Could not load history.'); } })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [editor.mode, product?.id, historyAttempt]);
  const run = async () => {
    if (locked.current || saved) return;
    locked.current = true; setBusy(true); setMessage(null); setFailed(false);
    try {
      if (editor.mode === 'product') await saveProduct(draft, product?.id);
      else if (editor.mode === 'stock' && product) await adjustStock(product, stock, threshold, reason);
      else if (editor.mode === 'publication' && product) await savePublication(product, publication, verification, categories);
      else if (editor.mode === 'category') await saveCategory(catName, slug, description, active, category?.id);
      else throw new Error('Choose a valid catalog action.');
      setSaved(true);
      setMessage(await refresh() ? 'Saved. Catalog refreshed. Close this sheet to review the saved state.' : 'Saved, but catalog refresh failed. Close this sheet and refresh before another edit.');
    } catch (e) { setFailed(true); setMessage(e instanceof Error ? e.message : 'Could not confirm the change. Refresh before retrying.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const confirm = () => Alert.alert(
    editor.mode === 'publication' ? 'Save publication state?' : editor.mode === 'stock' ? 'Record stock adjustment?' : 'Save catalog change?',
    editor.mode === 'product' ? 'This saves a draft, removes storefront visibility and clears publication verification. Review again before publication.'
      : editor.mode === 'publication' ? `Set ${product?.name} to ${publication}? Publication changes staged storefront visibility. Only attest to facts supported by evidence.`
      : editor.mode === 'stock' ? 'This records a physical count and adjustment reason in staging. Reserved stock remains protected by the server.' : 'This changes the staging category. Review effects on assigned products.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: () => void run() }],
  );
  const disabled = busy || saved || !recordEditsEnabled;
  return <Screen>
    <Button label="Close catalog editor" variant="secondary" onPress={close} />
    <Text accessibilityRole="header" style={styles.title}>{editor.mode === 'product' ? product ? 'Edit product' : 'Create draft' : editor.mode === 'stock' ? 'Adjust stock' : editor.mode === 'publication' ? 'Publication review' : editor.mode === 'category' ? 'Category' : 'Product history'}</Text>
    {product ? <Text style={styles.heading}>{product.name}</Text> : null}
    {editor.mode === 'product' ? <View style={styles.editor}>
      <Notice>Saving returns this product to draft and clears verification. Imported vendor costs are read-only.</Notice>
      {productFields.map(([key, label, limit]) => <Input key={key} label={label} value={draft[key]} change={value => setDraft(current => ({ ...current, [key]: value }))} max={limit} disabled={disabled} multiline={key === 'description'} />)}
      <Input label="Selling price (USD)" value={draft.price} change={price => setDraft(current => ({ ...current, price }))} max={20} disabled={disabled} numeric />
      <Choices label="Product category" options={[['', 'Choose category'], ...categories.map(c => [c.id, c.name + (c.active ? '' : ' (inactive)')] as [string, string])]} value={draft.category_id} change={category_id => setDraft(current => ({ ...current, category_id }))} disabled={disabled} />
      <Check label="Featured after publication" checked={draft.featured} change={featured => setDraft(current => ({ ...current, featured }))} disabled={disabled} />
    </View> : editor.mode === 'stock' ? <View style={styles.editor}>
      <Notice>Reserved: {product?.inventory?.reserved_quantity ?? 0}. Available: {product?.inventory?.available_to_sell ?? 'Unknown'}. Package size is not stock.</Notice>
      <Input label="Physical units on hand" value={stock} change={setStock} disabled={disabled} numeric max={10} />
      <Input label="Low-stock threshold" value={threshold} change={setThreshold} disabled={disabled} numeric max={10} />
      <Input label="Adjustment reason" value={reason} change={setReason} disabled={disabled} max={500} multiline />
    </View> : editor.mode === 'publication' ? <View style={styles.editor}>
      <Notice>Only verify facts supported by evidence. Synthetic products cannot be published.</Notice>
      <Choices label="Publication state" options={['draft', 'review', 'published', 'archived'].map(s => [s, s])} value={publication} change={value => setPublication(value as PublicationState)} disabled={disabled} />
      {([['authenticity', 'Authenticity and product details verified'], ['eligibility', 'Legal, platform and payment eligibility reviewed'], ['imagery', 'Image rights and accurate representation verified']] as const).map(([key, label]) => <Check key={key} label={label} checked={verification[key]} change={value => setVerification(current => ({ ...current, [key]: value }))} disabled={disabled} />)}
      <Input label="Review evidence and source references" value={verification.evidence} change={evidence => setVerification(current => ({ ...current, evidence }))} disabled={disabled} max={5000} multiline />
    </View> : editor.mode === 'category' ? <View style={styles.editor}>
      <Input label="Category name" value={catName} change={setCatName} max={100} disabled={disabled} />
      <Input label="URL slug" value={slug} change={setSlug} max={100} disabled={disabled} />
      <Input label="Category description" value={description} change={setDescription} max={1000} disabled={disabled} multiline />
      <Check label="Active category" checked={active} change={setActive} disabled={disabled} />
    </View> : <View style={styles.editor}>
      <Notice>Latest 100 recorded product and inventory events.</Notice>
      {events?.length === 0 ? <Notice>No recorded changes.</Notice> : events?.map(event => <Card key={event.id + (event.action || '')} style={styles.card}>
        <Text style={styles.heading}>{event.action || 'Change'}</Text><Text style={styles.caption}>{event.created_at}</Text>
        <Text selectable style={styles.body}>{JSON.stringify({ before: event.before_data, after: event.after_data, metadata: event.metadata }, null, 2)}</Text>
      </Card>)}
      <Button label="Reload history" variant="secondary" disabled={busy} onPress={() => setHistoryAttempt(n => n + 1)} />
    </View>}
    {busy ? <Notice>{editor.mode === 'history' ? 'Loading history…' : 'Saving…'}</Notice> : null}
    {message ? <Notice tone={failed ? 'error' : 'muted'}>{message}</Notice> : null}
    {editor.mode !== 'history' ? <Button label={saved ? 'Saved' : 'Save change'} disabled={disabled} onPress={confirm} /> : null}
  </Screen>;
}
function Input({ label, value, change, max, disabled, multiline, numeric }: { label: string; value: string; change: (value: string) => void; max: number; disabled?: boolean; multiline?: boolean; numeric?: boolean }) {
  return <View style={styles.field}><Text style={styles.caption}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} maxLength={max} editable={!disabled} multiline={multiline} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" style={[styles.input, multiline && styles.notes]} /></View>;
}
function Choices({ label, options, value, change, disabled }: { label: string; options: string[][]; value: string; change: (value: string) => void; disabled?: boolean }) {
  return <View style={styles.editor}><Text style={styles.caption}>{label}</Text><View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.filters}>{options.map(([key, text]) => <Pressable key={key} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: key === value, disabled }} onPress={() => change(key || '')} style={[styles.filter, key === value && styles.active]}><Text style={[styles.caption, key === value && { color: colors.background }]}>{text}</Text></Pressable>)}</View></View>;
}
function Check({ label, checked, change, disabled }: { label: string; checked: boolean; change: (value: boolean) => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => change(!checked)} style={styles.check}><Text style={styles.body}>{checked ? '✓ ' : '○ '}{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text }, heading: { ...type.label, color: colors.text }, body: { ...type.body, color: colors.text }, caption: { ...type.caption, color: colors.textMuted },
  amount: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] }, card: { padding: space[4], gap: space[3] }, field: { gap: space[1] }, editor: { gap: space[3] },
  input: { minHeight: touchTarget, paddingHorizontal: space[4], borderRadius: radius.control, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
  notes: { minHeight: 110, paddingVertical: space[3], textAlignVertical: 'top' }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  filter: { minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.controlBorder, backgroundColor: colors.surface, justifyContent: 'center' },
  active: { backgroundColor: colors.text, borderColor: colors.text }, check: { minHeight: touchTarget, justifyContent: 'center' },
});
