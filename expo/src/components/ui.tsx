import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, touchTarget, type } from '@/theme';

export function Screen({ children, refreshing, onRefresh }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" accessibilityLabel="core." style={[styles.wordmark, { fontSize: size }]}>
      core<Text style={{ color: colors.accent }}>.</Text>
    </Text>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ title, detail, trailing, trailingDetail, dot, last }: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  trailingDetail?: string;
  dot?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <View style={styles.rowEnd}>
        {typeof trailing === 'string' || typeof trailing === 'number'
          ? <Text style={styles.rowValue}>{trailing}</Text>
          : trailing}
        {trailingDetail ? <Text style={styles.rowDetail}>{trailingDetail}</Text> : null}
      </View>
    </View>
  );
}

export function Button({ label, onPress, disabled, variant = 'primary' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: primary ? colors.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ tone = 'muted', children }: PropsWithChildren<{ tone?: 'muted' | 'error' | 'warning' }>) {
  const color = tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : colors.textMuted;
  return <Text accessibilityLiveRegion="polite" style={[styles.notice, { color }]}>{children}</Text>;
}

export const money = (value: number) =>
  '$' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: space[5], paddingBottom: 120, gap: space[6] },
  wordmark: { color: colors.text, fontWeight: '800', letterSpacing: -0.5 },
  section: { ...type.section, color: colors.textMuted, marginBottom: space[2] },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[3] },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.body, color: colors.text },
  rowDetail: { ...type.caption, color: colors.textMuted },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
  rowValue: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  button: { minHeight: touchTarget, borderRadius: radius.pill, paddingHorizontal: space[5], alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { borderWidth: 1, borderColor: colors.controlBorder },
  buttonLabel: { ...type.label },
  notice: { ...type.caption },
});
