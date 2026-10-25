import { invokeCore } from "./invoke";
import { supabase } from "@/lib/supabase";
import { loadCustomers } from "./customers";
import {
  allowedEmail,
  assertPayload,
  exactFlag,
  numericFields,
  recordFields,
  normalizedEmail,
  pushFields,
  stagingRecoveryUrl,
  templateFields,
  type CoreAnalyticsPayload,
  type CoreAuditEvent,
  type CoreNotificationsPayload,
  type CoreReferralAdminPayload,
  type DiscountCodeRecord,
  type InviteableProfile,
  type MessageTemplate,
  type NexusPushRecipient,
} from "./workspace-models";
export const adminWritesEnabled = exactFlag(
  process.env.EXPO_PUBLIC_ENABLE_ADMIN_WRITES,
);
export const testMessagesEnabled = exactFlag(
  process.env.EXPO_PUBLIC_ENABLE_TEST_MESSAGES,
);
const allowlist = process.env.EXPO_PUBLIC_TEST_RECIPIENT_EMAILS;
function gate(messages = false) {
  if (!adminWritesEnabled || (messages && !testMessagesEnabled))
    throw new Error(
      "This staging action is disabled pending backend verification.",
    );
}
async function write(name: string, body: Record<string, unknown>) {
  const data = await invokeCore<Record<string, any>>(name, body, {
    retry: false,
  });
  if (data?.success !== true)
    throw new Error(
      "The result could not be confirmed. Refresh before retrying.",
    );
  return data;
}
export async function loadAnalytics(): Promise<CoreAnalyticsPayload> {
  const d = assertPayload(await invokeCore("core-analytics"), [
    "headline",
    "periods.7",
    "periods.30",
    "periods.90",
    "periods.all",
    "series.daily_90[]",
    "customers.membership_mix[]",
    "customers.top_customers[]",
    "orders.status_mix[]",
    "orders.payment_mix[]",
    "referrals",
    "products.top_products[]",
  ]);
  numericFields(d.headline, [
    "paid_revenue",
    "paid_orders",
    "average_paid_order",
    "customers",
    "active_customers",
    "purchasing_customers",
    "repeat_customers",
    "products",
    "active_products",
  ]);
  for (const p of Object.values(d.periods))
    numericFields(p, [
      "orders",
      "paid_orders",
      "revenue",
      "average_order",
      "new_customers",
      "purchasing_customers",
      "repeat_customers",
    ]);
  numericFields(d.referrals, [
    "total",
    "qualified",
    "converted",
    "qualification_rate",
    "conversion_rate",
    "rewards_available",
    "rewards_redeemed",
  ]);
  recordFields(
    d.series.daily_90,
    ["date", "label"],
    ["orders", "paid_orders", "revenue", "new_customers"],
  );
  recordFields(
    d.customers.top_customers,
    ["customer_id", "name"],
    ["paid_orders", "revenue"],
  );
  recordFields(d.customers.membership_mix, ["membership"], ["count"]);
  recordFields(
    d.products.top_products,
    ["product_id", "name"],
    ["quantity", "revenue", "orders"],
  );
  recordFields(d.orders.status_mix, ["status"], ["count"]);
  recordFields(d.orders.payment_mix, ["method"], ["count", "revenue"]);
  return d as CoreAnalyticsPayload;
}
export async function loadReferrals(): Promise<CoreReferralAdminPayload> {
  const d = assertPayload(await invokeCore("core-referrals-admin"), [
    "summary",
    "milestones[]",
    "referrers[]",
    "referrals[]",
    "rewards[]",
  ]);
  numericFields(d.summary, [
    "referrals",
    "qualified",
    "pending",
    "converted",
    "qualification_rate",
    "conversion_rate",
    "rewards_available",
    "rewards_active",
    "rewards_redeemed",
  ]);
  recordFields(d.milestones, ["label", "behavior"], ["threshold"]);
  recordFields(
    d.referrers,
    ["customer_id", "name", "membership"],
    [
      "total",
      "qualified",
      "pending",
      "converted",
      "available_rewards",
      "active_milestones",
      "redeemed_rewards",
    ],
  );
  if (
    d.referrers.some(
      (r: any) =>
        !r.next_milestone ||
        typeof r.next_milestone.label !== "string" ||
        typeof r.next_milestone.remaining !== "number",
    )
  )
    throw new Error("Referral milestones are incomplete.");
  recordFields(d.referrals, ["id", "referrer_name"]);
  return d as CoreReferralAdminPayload;
}
export async function loadNotifications(): Promise<CoreNotificationsPayload> {
  const d = assertPayload(await invokeCore("core-notifications"), [
    "summary",
    "notifications[]",
  ]);
  numericFields(d.summary, ["total", "critical", "warning", "info"]);
  recordFields(d.notifications, [
    "id",
    "severity",
    "category",
    "title",
    "detail",
    "href",
  ]);
  if (
    d.notifications.some(
      (n: any) => !["critical", "warning", "info"].includes(n.severity),
    )
  )
    throw new Error("Notification severity is invalid.");
  return d as CoreNotificationsPayload;
}
export async function loadAudit(): Promise<CoreAuditEvent[]> {
  const events = assertPayload(await invokeCore("core-audit"), [
    "events[]",
  ]).events;
  recordFields(events, [
    "id",
    "actor_user_id",
    "actor_role",
    "action",
    "entity_type",
    "entity_id",
    "created_at",
  ]);
  return events as CoreAuditEvent[];
}
export async function loadRecipients(): Promise<NexusPushRecipient[]> {
  const recipients = assertPayload(
    await invokeCore("core-nexus-push", { action: "list" }),
    ["recipients[]"],
  ).recipients;
  recordFields(recipients, ["id", "authUserId", "email", "accountStatus"]);
  if (recipients.some((p: any) => typeof p.pushEnabled !== "boolean"))
    throw new Error("Push recipient state is incomplete.");
  return recipients as NexusPushRecipient[];
}
export async function queueTestPush(
  mode: "all" | "individual",
  customerId: string,
  title: string,
  message: string,
  recipients: NexusPushRecipient[],
) {
  gate(true);
  const data = await write("core-nexus-push", {
    action: "send",
    ...pushFields(mode, customerId, title, message, recipients, allowlist),
  });
  if (!Number.isInteger(data.queued) || data.queued < 0)
    throw new Error(
      "Queue result could not be confirmed. Check history before retrying.",
    );
  return data.queued as number;
}
export async function loadAdminWorkspace() {
  const [tools, customers] = await Promise.all([
    invokeCore("core-admin-tools", { action: "list" }),
    loadCustomers(),
  ]);
  const data = assertPayload(tools, ["templates[]", "inviteable_profiles[]"]);
  recordFields(data.templates, ["id", "name", "message"]);
  recordFields(data.inviteable_profiles, ["id", "email"]);
  return {
    templates: data.templates as MessageTemplate[],
    inviteable: data.inviteable_profiles as InviteableProfile[],
    ...customers,
  };
}
export async function loadCodes(): Promise<DiscountCodeRecord[]> {
  const codes = assertPayload(
    await invokeCore("core-discount-codes", { action: "list" }),
    ["codes[]"],
  ).codes;
  recordFields(codes, ["id", "code", "kind"]);
  return codes as DiscountCodeRecord[];
}
export async function saveTemplate(
  name: string,
  category: string,
  message: string,
  active: boolean,
  templateId?: string,
) {
  gate();
  const data = await write("core-admin-tools", {
    action: "save_template",
    ...templateFields(name, category, message, active),
    ...(templateId ? { templateId } : {}),
  });
  if (!data.template?.id || (templateId && data.template.id !== templateId))
    throw new Error(
      "Saved template could not be confirmed. Refresh before retrying.",
    );
  return data.template as MessageTemplate;
}
export async function generateCode(kind: "free_shipping" | "referral_bonus") {
  gate();
  if (!["free_shipping", "referral_bonus"].includes(kind))
    throw new Error("Choose an available discount type.");
  const data = await write("core-discount-codes", { action: "generate", kind });
  if (!data.code?.id || typeof data.code.code !== "string")
    throw new Error(
      "Generated code could not be confirmed. Reload codes before retrying.",
    );
  return data.code as DiscountCodeRecord;
}
export async function inviteTester(profile: InviteableProfile) {
  gate(true);
  allowedEmail(profile.email, allowlist);
  if (
    profile.auth_user_id ||
    profile.account_status?.toLowerCase() !== "active"
  )
    throw new Error("Choose an active, unclaimed staging profile.");
  await write("core-admin-tools", {
    action: "invite_profile",
    customerId: profile.id,
  });
}
export async function activateTester(email: string) {
  gate(true);
  const target = allowedEmail(email, allowlist);
  const redirectTo = stagingRecoveryUrl(
    process.env.EXPO_PUBLIC_NEXUS_STAGING_ORIGIN,
  );
  const { error } = await supabase.auth.resetPasswordForEmail(target, {
    redirectTo,
  });
  if (error) throw new Error(error.message);
}
export async function updateAdminCustomer(
  customerId: string,
  action: "update_membership" | "update_account_status" | "update_email",
  value: string,
  membershipIds: string[] = [],
) {
  gate();
  let fields: Record<string, unknown>;
  if (action === "update_membership") {
    if (!membershipIds.includes(value))
      throw new Error("Choose a listed membership.");
    fields = { membershipId: value };
  } else if (action === "update_account_status") {
    if (!["Active", "Suspended"].includes(value))
      throw new Error("Choose Active or Suspended.");
    fields = { accountStatus: value };
  } else if (action === "update_email") {
    gate(true);
    fields = { email: allowedEmail(value, allowlist) };
  } else throw new Error("Unsupported customer action.");
  const data = await write("core-customer-control", {
    action,
    customerId,
    ...fields,
  });
  if (data.customer?.id !== customerId)
    throw new Error(
      "Customer change could not be confirmed. Refresh before retrying.",
    );
}
