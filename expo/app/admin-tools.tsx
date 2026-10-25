import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Text, View } from "react-native";
import { Button, Notice, Screen } from "@/components/ui";
import {
  Check,
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
  activateTester,
  adminWritesEnabled,
  generateCode,
  inviteTester,
  loadAdminWorkspace,
  loadCodes,
  saveTemplate,
  testMessagesEnabled,
  updateAdminCustomer,
} from "@/services/workspaces";
import { matchesText, type MessageTemplate } from "@/services/workspace-models";
import {
  type CoreCustomer,
  type CoreMembership,
} from "@/services/customer-model";
import { orderMoney } from "@/services/order-model";

type Editor =
  | { kind: "template"; template?: MessageTemplate }
  | { kind: "customer"; customer: CoreCustomer };
export default function AdminTools() {
  const state = useWorkspace(loadAdminWorkspace),
    codes = useWorkspace(loadCodes),
    d = state.data;
  const [query, setQuery] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [kind, setKind] = useState<"free_shipping" | "referral_bonus">(
      "free_shipping",
    );
  const [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [clock, setClock] = useState(Date.now());
  const lock = useRef(false),
    cooldown = useRef<Record<string, number>>({});
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const action = async (work: () => Promise<string>, key?: string) => {
    if (
      lock.current ||
      attempted ||
      (key && (cooldown.current[key] || 0) > Date.now())
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    setAttempted(true);
    if (key) cooldown.current[key] = Date.now() + 60000;
    try {
      setMessage(await work());
      await Promise.all([state.refresh(), codes.refresh()]);
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : "Could not confirm action.") +
          " Check saved state or history before another attempt.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const confirm = (
    title: string,
    body: string,
    work: () => Promise<string>,
    key?: string,
  ) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => void action(work, key) },
    ]);
  const inviteable = new Map(d?.inviteable.map((p) => [p.id, p]) ?? []);
  const customers =
    d?.customers.filter((c) =>
      matchesText(query, [
        c.first_name,
        c.last_name,
        c.email,
        c.customer_number,
      ]),
    ) ?? [];
  return (
    <Workspace title="Admin tools" state={state}>
      {!adminWritesEnabled ? (
        <Notice>
          Admin changes are disabled until the staging endpoints and audit
          behavior are verified.
        </Notice>
      ) : null}
      {!testMessagesEnabled ? (
        <Notice>
          Account invitations and activation email requests are disabled pending
          tester allowlist and staging recovery setup.
        </Notice>
      ) : null}
      {d ? (
        <>
          <Search
            value={query}
            change={setQuery}
            label="Search customer administration"
          />
          <Group title="Customer accounts">
            {customers.length ? (
              customers.map((c) => {
                const profile = inviteable.get(c.id),
                  key = "email:" + c.id,
                  wait = Math.max(
                    0,
                    Math.ceil(((cooldown.current[key] || 0) - clock) / 1000),
                  );
                return (
                  <View key={c.id} style={ws.entry}>
                    <Text style={ws.heading}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") ||
                        "Customer"}
                    </Text>
                    <Field
                      label={c.customer_number || "Customer"}
                      value={c.email}
                    />
                    <Field
                      label="Status / membership"
                      value={`${c.account_status} · ${c.membership?.name || "None"}`}
                    />
                    <Button
                      label="Manage membership, status and login email"
                      variant="secondary"
                      disabled={busy}
                      onPress={() =>
                        setEditor({ kind: "customer", customer: c })
                      }
                    />
                    {c.account_status.toLowerCase() === "active" ? (
                      <Button
                        label={
                          wait
                            ? `Try again in ${wait}s`
                            : profile
                              ? "Send staging invitation"
                              : "Request staging activation link"
                        }
                        variant="secondary"
                        disabled={
                          !adminWritesEnabled ||
                          !testMessagesEnabled ||
                          busy ||
                          attempted ||
                          wait > 0
                        }
                        onPress={() =>
                          confirm(
                            profile
                              ? "Send staging invitation?"
                              : "Request staging activation email?",
                            `Recipient: ${c.email}. This sends an authentication email to an approved staging tester.`,
                            async () => {
                              if (profile) await inviteTester(profile);
                              else await activateTester(c.email);
                              return "Authentication request accepted. Email delivery is not verified.";
                            },
                            key,
                          )
                        }
                      />
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Notice>No matching customers.</Notice>
            )}
          </Group>
          <Group title="Message templates">
            <Button
              label="Create template"
              disabled={busy}
              onPress={() => setEditor({ kind: "template" })}
            />
            {d.templates.length ? (
              d.templates.map((t) => (
                <View key={t.id} style={ws.entry}>
                  <Text style={ws.heading}>{t.name}</Text>
                  <Field
                    label={t.category || "Uncategorized"}
                    value={t.active ? "Active" : "Inactive"}
                  />
                  <Text selectable style={ws.body}>
                    {t.message}
                  </Text>
                  <Button
                    label={`Edit ${t.name}`}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => setEditor({ kind: "template", template: t })}
                  />
                </View>
              ))
            ) : (
              <Notice>No templates yet.</Notice>
            )}
          </Group>
        </>
      ) : null}
      <Group title="Discount codes">
        {codes.error ? (
          <>
            <Notice tone="error">{codes.error}</Notice>
            <Button
              label="Reload codes"
              variant="secondary"
              onPress={() => void codes.refresh()}
            />
          </>
        ) : null}
        <Choices
          label="New code type"
          options={[
            ["free_shipping", "Shipping discount"],
            ["referral_bonus", "Referral bonus"],
          ]}
          value={kind}
          change={(v) => setKind(v as typeof kind)}
          disabled={busy || attempted}
        />
        <Notice>
          Discount values and code rules are supplied by the server.
        </Notice>
        <Button
          label="Generate staging code"
          disabled={
            !adminWritesEnabled ||
            busy ||
            attempted ||
            !codes.data ||
            Boolean(codes.error)
          }
          onPress={() =>
            confirm(
              "Generate one staging discount code?",
              `Type: ${kind.replaceAll("_", " ")}. Check the result before creating another.`,
              async () => {
                const c = await generateCode(kind);
                return `Generated ${c.code}.`;
              },
            )
          }
        />
        {codes.data?.length ? (
          codes.data.map((c) => (
            <View key={c.id} style={ws.entry}>
              <Text selectable style={ws.heading}>
                {c.code}
              </Text>
              <Field label="Kind" value={c.kind.replaceAll("_", " ")} />
              <Field
                label="Status"
                value={
                  !c.active
                    ? "Inactive"
                    : c.used_at
                      ? "Used"
                      : c.one_time
                        ? "Available once"
                        : "Active"
                }
              />
              <Field
                label="Discount"
                value={[
                  c.discount_percent !== null ? `${c.discount_percent}%` : null,
                  c.shipping_discount !== null
                    ? orderMoney(c.shipping_discount) + " shipping"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </View>
          ))
        ) : codes.data ? (
          <Notice>No discount codes.</Notice>
        ) : (
          <Notice>Loading codes…</Notice>
        )}
      </Group>
      {busy ? <Notice>Working…</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {attempted ? (
        <Button
          label="Allow another action after reviewing saved state"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            setAttempted(false);
            setMessage(null);
          }}
        />
      ) : null}
      <Modal
        visible={Boolean(editor)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditor(null)}
      >
        {editor ? (
          <AdminEditor
            editor={editor}
            memberships={d?.memberships ?? []}
            close={() => setEditor(null)}
            refresh={state.refresh}
          />
        ) : null}
      </Modal>
    </Workspace>
  );
}
function AdminEditor({
  editor,
  memberships,
  close,
  refresh,
}: {
  editor: Editor;
  memberships: CoreMembership[];
  close: () => void;
  refresh: () => Promise<boolean>;
}) {
  const t = editor.kind === "template" ? editor.template : undefined,
    c = editor.kind === "customer" ? editor.customer : undefined;
  const [name, setName] = useState(t?.name || ""),
    [category, setCategory] = useState(t?.category || ""),
    [message, setMessage] = useState(t?.message || ""),
    [active, setActive] = useState(t?.active ?? true);
  const [membership, setMembership] = useState(c?.membership?.id || ""),
    [status, setStatus] = useState(
      c?.account_status.toLowerCase() === "suspended" ? "Suspended" : "Active",
    ),
    [email, setEmail] = useState(c?.email || "");
  const [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [result, setResult] = useState<string | null>(null);
  const lock = useRef(false);
  const run = async (work: () => Promise<unknown>) => {
    if (lock.current || attempted) return;
    lock.current = true;
    setBusy(true);
    setAttempted(true);
    setResult(null);
    try {
      await work();
      setResult(
        (await refresh())
          ? "Change accepted. Workspace refreshed; close to review saved state."
          : "Change accepted. Refresh the workspace before another action.",
      );
    } catch (e) {
      setResult(
        (e instanceof Error ? e.message : "Result unknown.") +
          " Draft retained. Check saved state/history before retrying.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const confirm = (title: string, body: string, work: () => Promise<unknown>) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm change", onPress: () => void run(work) },
    ]);
  const disabled = !adminWritesEnabled || busy || attempted;
  return (
    <Screen>
      <Button label="Close admin editor" variant="secondary" onPress={close} />
      <Text accessibilityRole="header" style={ws.title}>
        {c ? "Customer administration" : "Message template"}
      </Text>
      {!adminWritesEnabled ? (
        <Notice>Staging admin writes are disabled.</Notice>
      ) : null}
      {c ? (
        <>
          <Field
            label="Customer"
            value={`${c.customer_number || ""} · ${c.email}`}
          />
          <Choices
            label="Membership"
            options={memberships.map((m) => [m.id, m.name])}
            value={membership}
            change={setMembership}
            disabled={disabled}
          />
          <Button
            label="Save membership"
            disabled={disabled || !membership}
            onPress={() =>
              confirm(
                "Change staging membership?",
                `Customer: ${c.email}. New membership: ${memberships.find((m) => m.id === membership)?.name}. Referral rules may later adjust membership.`,
                () =>
                  updateAdminCustomer(
                    c.id,
                    "update_membership",
                    membership,
                    memberships.map((m) => m.id),
                  ),
              )
            }
          />
          <Choices
            label="Account status"
            options={[
              ["Active", "Active"],
              ["Suspended", "Suspended"],
            ]}
            value={status}
            change={setStatus}
            disabled={disabled}
          />
          <Button
            label="Save account status"
            variant="secondary"
            disabled={disabled}
            onPress={() =>
              confirm(
                "Change staging account status?",
                `${c.email}: ${status}. Suspension blocks new checkout/invoice requests while preserving history access.`,
                () =>
                  updateAdminCustomer(c.id, "update_account_status", status),
              )
            }
          />
          <Input
            label="New login email"
            value={email}
            change={setEmail}
            max={254}
            disabled={disabled || !testMessagesEnabled}
          />
          <Button
            label="Change staging login email"
            variant="secondary"
            disabled={
              disabled ||
              !testMessagesEnabled ||
              email.trim().toLowerCase() === c.email.toLowerCase()
            }
            onPress={() =>
              confirm(
                "Change staging login email?",
                `Current: ${c.email}
New: ${email}. This affects authentication and requires an approved tester email.`,
                () => updateAdminCustomer(c.id, "update_email", email),
              )
            }
          />
        </>
      ) : (
        <>
          <Input
            label="Template name"
            value={name}
            change={setName}
            max={120}
            disabled={disabled}
          />
          <Input
            label="Template category"
            value={category}
            change={setCategory}
            max={80}
            disabled={disabled}
          />
          <Input
            label="Template message"
            value={message}
            change={setMessage}
            max={5000}
            multiline
            disabled={disabled}
          />
          <Check
            label="Active template"
            value={active}
            change={setActive}
            disabled={disabled}
          />
          <Button
            label="Save template"
            disabled={disabled || !name.trim() || !message.trim()}
            onPress={() =>
              confirm(
                "Save staging template?",
                `${name}. Saving a template does not send it to customers.`,
                () => saveTemplate(name, category, message, active, t?.id),
              )
            }
          />
        </>
      )}
      {busy ? <Notice>Saving…</Notice> : null}
      {result ? <Notice>{result}</Notice> : null}
      {attempted ? (
        <Button
          label="Enable retry after checking history"
          disabled={busy}
          variant="secondary"
          onPress={() => {
            setAttempted(false);
            setResult(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
