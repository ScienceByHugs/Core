import { useState } from "react";
import { Text, View } from "react-native";
import { Notice } from "@/components/ui";
import {
  Choices,
  Field,
  Group,
  Search,
  Workspace,
  useWorkspace,
  ws,
} from "@/components/workspace";
import { loadReferrals } from "@/services/workspaces";
import { matchesText } from "@/services/workspace-models";
import { financeTime } from "@/services/finance-model";
export default function Referrals() {
  const state = useWorkspace(loadReferrals),
    d = state.data;
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const records =
    d?.referrals.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        matchesText(query, [
          r.referrer_name,
          r.referrer_number,
          r.referred_name,
          r.referred_email,
          r.referred_customer_name,
          r.referral_code,
          r.qualifying_order_number,
        ]),
    ) ?? [];
  return (
    <Workspace title="Referrals" state={state}>
      {d ? (
        <>
          <Group title="Summary">
            {Object.entries(d.summary).map(([key, value]) => (
              <Field
                key={key}
                label={key.replaceAll("_", " ")}
                value={key.endsWith("_rate") ? `${value}%` : value}
              />
            ))}
          </Group>
          <Group title="Milestones">
            {d.milestones.map((m, i) => (
              <Field
                key={m.threshold + i}
                label={`${m.threshold} qualified · ${m.label}`}
                value={m.behavior}
              />
            ))}
            {!d.milestones.length ? (
              <Notice>No milestone configuration returned.</Notice>
            ) : null}
          </Group>
          <Search
            value={query}
            change={setQuery}
            label="Search referral people, code or order"
          />
          <Choices
            label="Referral status"
            options={[
              ["all", "All"],
              ...[
                ...new Set(
                  d.referrals
                    .map((r) => r.status)
                    .filter((s): s is string => Boolean(s)),
                ),
              ].map((s) => [s, s] as [string, string]),
            ]}
            value={status}
            change={setStatus}
          />
          <Group title="Customer progress">
            {d.referrers
              .filter((r) =>
                matchesText(query, [
                  r.name,
                  r.email,
                  r.customer_number,
                  r.referral_code,
                ]),
              )
              .map((r, i) => (
                <View key={r.customer_id + i} style={ws.entry}>
                  <Text style={ws.heading}>{r.name}</Text>
                  <Field
                    label="Membership / code"
                    value={`${r.membership} · ${r.referral_code || "—"}`}
                  />
                  <Field
                    label="Qualified / pending / converted"
                    value={`${r.qualified} / ${r.pending} / ${r.converted}`}
                  />
                  <Field
                    label="Next milestone"
                    value={`${r.next_milestone.label} · ${r.next_milestone.threshold === null ? "Complete" : r.next_milestone.remaining + " remaining"}`}
                  />
                  <Field
                    label="Available / active / redeemed rewards"
                    value={`${r.available_rewards} / ${r.active_milestones} / ${r.redeemed_rewards}`}
                  />
                </View>
              ))}
            {!d.referrers.length ? (
              <Notice>No referrer progress.</Notice>
            ) : null}
          </Group>
          <Group title="Referral records">
            <Notice>
              {records.length} of {d.referrals.length} loaded records shown.
            </Notice>
            {records.length ? (
              records.map((r) => (
                <View key={r.id} style={ws.entry}>
                  <Text style={ws.heading}>
                    {r.referrer_name} →{" "}
                    {r.referred_customer_name ||
                      r.referred_name ||
                      r.referred_email ||
                      "Customer"}
                  </Text>
                  <Field
                    label="Status / code"
                    value={`${r.status || "—"} · ${r.referral_code || "—"}`}
                  />
                  <Field
                    label="Referred / qualified / converted"
                    value={`${financeTime(r.referred_at)} / ${financeTime(r.qualified_at)} / ${financeTime(r.converted_at)}`}
                  />
                  <Field
                    label="Qualifying order"
                    value={r.qualifying_order_number}
                  />
                  <Field
                    label="Consent confirmed"
                    value={
                      r.consent_confirmed === null
                        ? "Unknown"
                        : r.consent_confirmed
                          ? "Yes"
                          : "No"
                    }
                  />
                  <Field label="Notes" value={r.notes} />
                </View>
              ))
            ) : (
              <Notice>No matching referral records.</Notice>
            )}
          </Group>
          <Group title="Reward records">
            {d.rewards.length ? (
              d.rewards.map((r, i) => (
                <View key={String(r.id || i)} style={ws.entry}>
                  <Field
                    label="Reward"
                    value={r.title || r.reward_type || "Reward"}
                  />
                  <Field label="Status" value={r.status} />
                  <Field label="Value" value={r.reward_value} />
                  <Field
                    label="Customer"
                    value={r.customer_id || r.referrer_id}
                  />
                  <Field label="Description" value={r.description} />
                  <Field
                    label="Expires"
                    value={
                      typeof r.expires_at === "string"
                        ? financeTime(r.expires_at)
                        : null
                    }
                  />
                </View>
              ))
            ) : (
              <Notice>No rewards returned.</Notice>
            )}
          </Group>
          <Notice>
            Report generated {financeTime(d.generated_at)}. Reward and
            membership rules are supplied by the staging service.
          </Notice>
        </>
      ) : null}
    </Workspace>
  );
}
