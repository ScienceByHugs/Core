import { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Notice } from "@/components/ui";
import { Check, Choices, Field, Group, Input, Workspace, useWorkspace, ws } from "@/components/workspace";
import { decide, documentLink, loadApplications } from "@/services/research";
import {
  daysLeft,
  decisionProblem,
  isFreeEmailDomain,
  researchStatuses,
  type ResearchApplication,
  type ResearchStatus,
} from "@/services/research-model";
import { financeTime } from "@/services/finance-model";
import { recordEditsEnabled, recordEditsOffMessage } from "@/services/write-gate";

export default function Research() {
  const [status, setStatus] = useState<ResearchStatus>("pending");
  const loader = useCallback(() => loadApplications(status), [status]);
  const state = useWorkspace(loader);
  const list = state.data ?? [];
  return (
    <Workspace title="Research access" state={state}>
      <Notice>
        Only approved researchers can see products, prices or stock, or place orders. Check each institution and role before approving. Approval lasts one year.
      </Notice>
      {!recordEditsEnabled ? <Notice tone="warning">{recordEditsOffMessage}</Notice> : null}
      <Choices
        label="Show"
        options={researchStatuses}
        value={status}
        change={(v) => setStatus(v as ResearchStatus)}
      />
      {state.data ? (
        <Group title={`${list.length} ${researchStatuses.find(([s]) => s === status)?.[1].toLowerCase()}`}>
          {list.length ? (
            list.map((a) => <Application key={a.id} application={a} onDecided={() => void state.refresh()} />)
          ) : (
            <Notice>No applications here.</Notice>
          )}
        </Group>
      ) : null}
    </Workspace>
  );
}

function Application({ application: a, onDecided }: { application: ResearchApplication; onDecided: () => void }) {
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "muted"; text: string } | null>(null);
  const webmail = isFreeEmailDomain(a.email_domain);
  const remaining = daysLeft(a.expires_at);

  async function run(decision: "approved" | "denied") {
    const problem = decisionProblem(a, decision, reason, override);
    if (problem) return setMessage({ tone: "error", text: problem });
    setBusy(true);
    setMessage(null);
    try {
      await decide(a, decision, reason, override);
      setMessage({ tone: "muted", text: decision === "approved" ? "Approved." : "Denied." });
      onDecided();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save the decision." });
    } finally {
      setBusy(false);
    }
  }

  async function openDocument() {
    try {
      await Linking.openURL(await documentLink(a.id));
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not open the document." });
    }
  }

  return (
    <View style={ws.entry}>
      <Text style={ws.heading}>{a.institution_name}</Text>
      <Field label="Applicant" value={`${a.role_title} · ${a.institutional_email}`} />
      <Field label="Department" value={a.department} />
      <Field label="Principal investigator" value={a.principal_investigator} />
      <Field label="Research" value={a.research_summary} />
      <Field label="Submitted" value={financeTime(a.submitted_at)} />
      {webmail ? (
        <Notice tone="warning">Personal email domain ({a.email_domain}). This is not an institutional address.</Notice>
      ) : null}
      {a.document_path ? (
        <Button label="Open supporting document" variant="secondary" onPress={() => void openDocument()} />
      ) : (
        <Notice>No supporting document uploaded.</Notice>
      )}
      {a.status === "approved" ? (
        <Field
          label="Approved until"
          value={`${financeTime(a.expires_at)}${remaining !== null ? ` (${remaining > 0 ? `${remaining} days left` : "expired"})` : ""}${a.free_domain_override ? " · personal-domain override" : ""}`}
        />
      ) : null}
      {a.status === "denied" ? <Field label="Reason" value={a.decision_reason} /> : null}
      {a.status === "pending" ? (
        <>
          <Input label="Note to applicant (required to deny)" value={reason} change={setReason} max={2000} multiline disabled={busy} />
          {webmail ? (
            <Check label="I checked this applicant another way and approve the personal email anyway" value={override} change={setOverride} disabled={busy} />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Approve" disabled={busy || !recordEditsEnabled} onPress={() => void run("approved")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Deny" variant="secondary" disabled={busy || !recordEditsEnabled} onPress={() => void run("denied")} />
            </View>
          </View>
        </>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </View>
  );
}
