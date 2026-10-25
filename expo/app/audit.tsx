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
import { loadAudit } from "@/services/workspaces";
import { matchesText } from "@/services/workspace-models";
import { financeTime } from "@/services/finance-model";
export default function Audit() {
  const state = useWorkspace(loadAudit);
  const [query, setQuery] = useState(""),
    [entity, setEntity] = useState("all"),
    [expanded, setExpanded] = useState<string | null>(null);
  const all = state.data ?? [],
    shown = all.filter(
      (e) =>
        (entity === "all" || e.entity_type === entity) &&
        matchesText(query, [
          e.action,
          e.actor_email,
          e.actor_user_id,
          e.actor_role,
          e.entity_type,
          e.entity_id,
          e.metadata?.customer_number,
        ]),
    );
  return (
    <Workspace title="Audit" state={state}>
      <Notice>
        Read-only history of controlled core changes. Coverage is limited to the
        events returned by the service.
      </Notice>
      <Search
        value={query}
        change={setQuery}
        label="Search action, operator or entity"
      />
      <Choices
        label="Entity type"
        options={[
          ["all", "All"],
          ...[...new Set(all.map((e) => e.entity_type))].map(
            (s) => [s, s] as [string, string],
          ),
        ]}
        value={entity}
        change={setEntity}
      />
      {state.data ? (
        <Group title="Events">
          <Notice>
            {shown.length} of {all.length} loaded events shown.
          </Notice>
          {shown.length ? (
            shown.map((e) => (
              <View key={e.id} style={ws.entry}>
                <Text style={ws.heading}>{e.action.replaceAll("_", " ")}</Text>
                <Field label="When" value={financeTime(e.created_at)} />
                <Field
                  label="Operator / role"
                  value={`${e.actor_email || e.actor_user_id} · ${e.actor_role}`}
                />
                <Field
                  label="Entity"
                  value={`${e.entity_type} · ${e.entity_id}`}
                />
                <Text
                  accessibilityRole="button"
                  accessibilityLabel={`${expanded === e.id ? "Hide" : "Show"} changes for ${e.action}`}
                  onPress={() => setExpanded(expanded === e.id ? null : e.id)}
                  style={[ws.choice, ws.body]}
                >
                  {expanded === e.id ? "Hide changes" : "Show changes"}
                </Text>
                {expanded === e.id ? (
                  <>
                    <Field
                      label="Before"
                      value={JSON.stringify(e.before_data, null, 2)}
                    />
                    <Field
                      label="After"
                      value={JSON.stringify(e.after_data, null, 2)}
                    />
                    <Field
                      label="Metadata"
                      value={JSON.stringify(e.metadata, null, 2)}
                    />
                  </>
                ) : null}
              </View>
            ))
          ) : (
            <Notice>No matching audit events.</Notice>
          )}
        </Group>
      ) : null}
    </Workspace>
  );
}
