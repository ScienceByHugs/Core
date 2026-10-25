import { useCallback, useRef, useState, type PropsWithChildren } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Notice, Screen, SectionTitle } from "./ui";
import { colors, radius, space, touchTarget, type } from "@/theme";
export function useWorkspace<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const next = await loader();
      if (id !== request.current) return false;
      setData(next);
      setError(null);
      return true;
    } catch (e) {
      if (id === request.current)
        setError(
          e instanceof Error ? e.message : "Could not load this workspace.",
        );
      return false;
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  }, [loader]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        request.current++;
      };
    }, [refresh]),
  );
  return { data, error, refreshing, refresh };
}
export function Workspace({
  title,
  state,
  children,
}: PropsWithChildren<{
  title: string;
  state: {
    data: unknown;
    error: string | null;
    refreshing: boolean;
    refresh: () => Promise<boolean>;
  };
}>) {
  const router = useRouter();
  return (
    <Screen
      refreshing={state.refreshing}
      onRefresh={() => void state.refresh()}
    >
      <Button
        label="Back to Home"
        variant="secondary"
        onPress={() => router.replace("/(tabs)")}
      />
      <Text accessibilityRole="header" style={ws.title}>
        {title}
      </Text>
      <Notice>Staging</Notice>
      {state.error ? (
        <>
          <Notice tone="error">{state.error}</Notice>
          {state.data ? (
            <Notice tone="warning">
              Showing previously loaded records. Refresh for the latest state.
            </Notice>
          ) : null}
          <Button
            label="Retry"
            variant="secondary"
            disabled={state.refreshing}
            onPress={() => void state.refresh()}
          />
        </>
      ) : null}
      {!state.data && !state.error ? <Notice>Loading…</Notice> : null}
      {children}
    </Screen>
  );
}
export function Group({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      <Card style={ws.card}>{children}</Card>
    </View>
  );
}
export function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={ws.field}>
      <Text style={ws.caption}>{label}</Text>
      <Text selectable style={ws.body}>
        {value === null || value === undefined || value === ""
          ? "—"
          : String(value)}
      </Text>
    </View>
  );
}
export function Search({
  value,
  change,
  label = "Search",
}: {
  value: string;
  change: (v: string) => void;
  label?: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.textMuted}
      value={value}
      onChangeText={change}
      autoCapitalize="none"
      autoCorrect={false}
      style={ws.input}
    />
  );
}
export function Input({
  label,
  value,
  change,
  max = 5000,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  max?: number;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={ws.field}>
      <Text style={ws.caption}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        maxLength={max}
        multiline={multiline}
        editable={!disabled}
        autoCapitalize="none"
        style={[ws.input, multiline && ws.multiline]}
      />
    </View>
  );
}
export function Choices({
  label,
  options,
  value,
  change,
  disabled = false,
}: {
  label: string;
  options: Array<[string, string]>;
  value: string;
  change: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={ws.gap}>
      <Text style={ws.caption}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={ws.choices}
      >
        {options.map(([key, text]) => (
          <Pressable
            key={key}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: key === value, disabled }}
            onPress={() => change(key)}
            style={[ws.choice, key === value && ws.chosen]}
          >
            <Text
              style={[
                ws.caption,
                key === value && { color: colors.background },
              ]}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Check({
  label,
  value,
  change,
  disabled = false,
}: {
  label: string;
  value: boolean;
  change: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => change(!value)}
      style={ws.choice}
    >
      <Text style={ws.body}>
        {value ? "✓ " : "○ "}
        {label}
      </Text>
    </Pressable>
  );
}
export const ws = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.caption, color: colors.textMuted },
  heading: { ...type.label, color: colors.text },
  amount: { ...type.label, color: colors.text, fontVariant: ["tabular-nums"] },
  card: { padding: space[4], gap: space[4] },
  gap: { gap: space[3] },
  field: { gap: space[1] },
  entry: {
    gap: space[2],
    paddingBottom: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  input: {
    minHeight: touchTarget,
    paddingHorizontal: space[4],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  multiline: {
    minHeight: 120,
    paddingVertical: space[3],
    textAlignVertical: "top",
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  choice: {
    minHeight: touchTarget,
    padding: space[3],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    justifyContent: "center",
  },
  chosen: { backgroundColor: colors.text },
});
