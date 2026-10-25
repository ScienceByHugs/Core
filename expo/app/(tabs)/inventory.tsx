import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Row, Screen } from '@/components/ui';
import { loadInventory, stockState, type InventoryProduct, type StockState } from '@/services/inventory';
import { colors, radius, space, touchTarget, type } from '@/theme';

type Filter = 'all' | 'low' | 'out' | 'unknown';

const tag: Record<StockState, { text: string; color: string }> = {
  ok: { text: 'In stock', color: colors.textMuted },
  low: { text: 'Low stock', color: colors.warning },
  out: { text: 'Out of stock', color: colors.error },
  unknown: { text: 'Stock not counted', color: colors.textMuted },
};

export default function InventoryScreen() {
  const router = useRouter();
  const request = useRef(0);
  const [products, setProducts] = useState<InventoryProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const data = await loadInventory();
      if (id === request.current) { setProducts(data); setError(null); }
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load inventory.');
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));

  const all = products ?? [];
  const counts = useMemo(() => {
    const c = { all: all.length, low: 0, out: 0, unknown: 0 };
    for (const p of all) {
      const s = stockState(p);
      if (s !== 'ok') c[s] += 1;
    }
    return c;
  }, [all]);

  const totals = useMemo(() => all.reduce(
    (t, p) => ({
      onHand: t.onHand + (p.inventory?.stock_on_hand ?? 0),
      reserved: t.reserved + (p.inventory?.reserved_quantity ?? 0),
      available: t.available + Math.max(0, p.inventory?.available_to_sell ?? 0),
    }),
    { onHand: 0, reserved: 0, available: 0 },
  ), [all]);

  const shown = all.filter(p => {
    if (filter !== 'all' && stockState(p) !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || [p.name, p.sku, p.lot_number, p.quantity].some(v => v?.toLowerCase().includes(q));
  });

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'low', label: 'Low' },
    { id: 'out', label: 'Out' },
    { id: 'unknown', label: 'Not counted' },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Text accessibilityRole="header" style={styles.title}>Inventory</Text>
      <Button label="Manage catalog" variant="secondary" onPress={() => router.push('/catalog')} />

      <TextInput
        accessibilityLabel="Search inventory"
        placeholder="Search product, SKU or lot"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        style={styles.search}
      />

      <View accessibilityRole="tablist" style={styles.filters}>
        {filters.map(f => {
          const on = f.id === filter;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.id)}
              style={[styles.pill, on && styles.pillOn]}
            >
              <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>{f.label} · {counts[f.id]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.summary}>
        <Summary label="On hand" value={totals.onHand} />
        <Summary label="Reserved" value={totals.reserved} divided />
        <Summary label="Available" value={totals.available} />
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        {!products ? (
          <Row title={refreshing ? 'Loading…' : 'Not loaded'} last />
        ) : shown.length === 0 ? (
          <Row title="No matching products" detail="Change the search or filter." last />
        ) : (
          shown.map((p, i) => {
            const s = stockState(p);
            const available = p.inventory?.available_to_sell;
            return (
              <Row
                key={p.id}
                title={[p.name, p.quantity].filter(Boolean).join(' · ')}
                detail={[p.sku, p.lot_number ? `Lot ${p.lot_number}` : null].filter(Boolean).join(' · ') || undefined}
                trailing={
                  <Text style={[styles.available, { color: s === 'ok' ? colors.text : tag[s].color }]}>
                    {available === null || available === undefined ? '—' : available}
                  </Text>
                }
                trailingDetail={s === 'ok' ? `of ${p.inventory?.stock_on_hand ?? 0} on hand` : tag[s].text}
                last={i === shown.length - 1}
              />
            );
          })
        )}
      </Card>
    </Screen>
  );
}

function Summary({ label, value, divided }: { label: string; value: number; divided?: boolean }) {
  return (
    <View style={[styles.summaryCell, divided && styles.summaryDivided]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  search: {
    minHeight: touchTarget,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space[4],
    fontSize: 16,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  pill: {
    minHeight: 36,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: colors.text, borderColor: colors.text },
  pillLabel: { ...type.caption, fontSize: 13, fontWeight: '500', color: colors.text },
  pillLabelOn: { color: colors.background },
  summary: { flexDirection: 'row', paddingVertical: space[3] },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivided: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
  summaryValue: { ...type.metric, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  summaryLabel: { ...type.caption, color: colors.textMuted },
  available: { ...type.metric, fontSize: 17, fontVariant: ['tabular-nums'] },
});
