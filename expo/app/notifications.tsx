import { useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { Alert, Text, View } from "react-native";
import { Button, Notice } from "@/components/ui";
import {
  Choices,
  Field,
  Group,
  Input,
  Search,
  Workspace,
  useWorkspace,
  ws,
} from "@/components/workspace";
import {
  adminWritesEnabled,
  testMessagesEnabled,
  loadNotifications,
  loadRecipients,
  queueTestPush,
} from "@/services/workspaces";
import { matchesText, notificationRoute } from "@/services/workspace-models";
import { financeTime } from "@/services/finance-model";
import { colors } from "@/theme";
export default function Notifications() {
  const router = useRouter(),
    state = useWorkspace(loadNotifications),
    audience = useWorkspace(loadRecipients),
    d = state.data;
  const [severity, setSeverity] = useState("all"),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState<"all" | "individual">("individual"),
    [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState("nexus · Science By Hugs"),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false);
  const lock = useRef(false),
    enabled = adminWritesEnabled && testMessagesEnabled,
    recipients = audience.data ?? [],
    eligible = recipients.filter(
      (p) => p.pushEnabled && p.accountStatus.toLowerCase() === "active",
    );
  const queue = async () => {
    if (lock.current || attempted) return;
    lock.current = true;
    setBusy(true);
    setResult(null);
    setAttempted(true);
    try {
      const queued = await queueTestPush(
        mode,
        customerId,
        title,
        message,
        recipients,
      );
      setResult(
        `Queued for ${queued} recipient(s). Delivery has not been verified.`,
      );
    } catch (e) {
      setResult(
        (e instanceof Error ? e.message : "Queue result unknown.") +
          " Check audit/history before creating another message.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const confirm = () => {
    const selected = eligible.find((p) => p.id === customerId);
    Alert.alert(
      "Queue this staging test notification?",
      `${mode === "all" ? eligible.length + " eligible staging recipients" : selected?.email || "No selected recipient"}

${title}
${message}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Queue test notification", onPress: () => void queue() },
      ],
    );
  };
  const shown =
    d?.notifications.filter(
      (n) =>
        (severity === "all" || n.severity === severity) &&
        matchesText(query, [n.title, n.detail, n.category]),
    ) ?? [];
  return (
    <Workspace title="Notifications" state={state}>
      {d ? (
        <>
          <Group title="Operational signals">
            {Object.entries(d.summary).map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
          </Group>
          <Search
            value={query}
            change={setQuery}
            label="Search operational signals"
          />
          <Choices
            label="Severity"
            options={[
              ["all", "All"],
              ["critical", "Critical"],
              ["warning", "Warning"],
              ["info", "Info"],
            ]}
            value={severity}
            change={setSeverity}
          />
          <Group title="Current signals">
            {shown.length ? (
              shown.map((n, i) => {
                const route = notificationRoute(n.href);
                return (
                  <View key={n.id + i} style={ws.entry}>
                    <Text
                      style={[
                        ws.heading,
                        {
                          color:
                            n.severity === "critical"
                              ? colors.error
                              : n.severity === "warning"
                                ? colors.warning
                                : colors.text,
                        },
                      ]}
                    >
                      {n.severity} · {n.title}
                    </Text>
                    <Field label={n.category} value={n.detail} />
                    <Text style={ws.caption}>{financeTime(n.created_at)}</Text>
                    {route ? (
                      <Button
                        label="Open related workspace"
                        variant="secondary"
                        onPress={() => router.push(route as Href)}
                      />
                    ) : (
                      <Notice>
                        Related action is available in the current core app.
                      </Notice>
                    )}
                  </View>
                );
              })
            ) : (
              <Notice>No matching operational signals.</Notice>
            )}
          </Group>
          <Notice>Signals generated {financeTime(d.generated_at)}.</Notice>
        </>
      ) : null}
      <Group title="nexus test notification">
        {!enabled ? (
          <Notice>
            Sending is disabled until synthetic staging recipients and delivery
            targets are verified.
          </Notice>
        ) : null}
        {audience.error ? (
          <>
            <Notice tone="error">{audience.error}</Notice>
            <Button
              label="Reload recipients"
              variant="secondary"
              onPress={() => void audience.refresh()}
            />
          </>
        ) : null}
        <Notice>
          {eligible.length} loaded active recipients have push enabled.
        </Notice>
        <Choices
          label="Audience"
          options={[
            ["individual", "Individual tester"],
            ["all", "All eligible testers"],
          ]}
          value={mode}
          change={(v) => setMode(v as "all" | "individual")}
          disabled={busy || attempted}
        />
        {mode === "individual" ? (
          <Choices
            label="Tester"
            options={eligible.map(
              (p) =>
                [
                  p.id,
                  [p.customerNumber, p.firstName, p.lastName, p.email]
                    .filter(Boolean)
                    .join(" · "),
                ] as [string, string],
            )}
            value={customerId}
            change={setCustomerId}
            disabled={busy || attempted}
          />
        ) : null}
        <Input
          label="Notification title"
          value={title}
          change={setTitle}
          max={80}
          disabled={busy || attempted}
        />
        <Input
          label="Notification message"
          value={message}
          change={setMessage}
          max={240}
          multiline
          disabled={busy || attempted}
        />
        <Notice>{message.length} / 240 characters</Notice>
        <Button
          label={busy ? "Queuing…" : "Queue test notification"}
          disabled={
            !enabled ||
            busy ||
            attempted ||
            Boolean(audience.error) ||
            !audience.data ||
            !eligible.length ||
            (mode === "individual" && !customerId) ||
            !title.trim() ||
            !message.trim()
          }
          onPress={confirm}
        />
        {result ? <Notice>{result}</Notice> : null}
        {attempted ? (
          <Button
            label="Start another message after checking history"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setAttempted(false);
              setMessage("");
              setResult(null);
              void audience.refresh();
            }}
          />
        ) : null}
      </Group>
      <Notice>
        Device push registration and delivery on this native core build remain
        pending physical-device setup. Operational signals load independently.
      </Notice>
    </Workspace>
  );
}
