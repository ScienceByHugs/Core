export type AnalyticsPeriod = {
  days: number | null;
  orders: number;
  paid_orders: number;
  revenue: number;
  average_order: number;
  new_customers: number;
  purchasing_customers: number;
  repeat_customers: number;
};

export type AnalyticsDay = {
  date: string;
  label: string;
  orders: number;
  paid_orders: number;
  revenue: number;
  new_customers: number;
};

export type CoreAnalyticsPayload = {
  generated_at: string;
  headline: {
    paid_revenue: number;
    paid_orders: number;
    average_paid_order: number;
    customers: number;
    active_customers: number;
    purchasing_customers: number;
    repeat_customers: number;
    products: number;
    active_products: number;
  };
  periods: {
    "7": AnalyticsPeriod;
    "30": AnalyticsPeriod;
    "90": AnalyticsPeriod;
    all: AnalyticsPeriod;
  };
  series: {
    daily_90: AnalyticsDay[];
  };
  customers: {
    membership_mix: Array<{ membership: string; count: number }>;
    top_customers: Array<{
      customer_id: string;
      customer_number: string | null;
      name: string;
      paid_orders: number;
      revenue: number;
      last_order_at: string | null;
    }>;
  };
  orders: {
    status_mix: Array<{ status: string; count: number }>;
    payment_mix: Array<{ method: string; count: number; revenue: number }>;
  };
  referrals: {
    total: number;
    qualified: number;
    converted: number;
    qualification_rate: number;
    conversion_rate: number;
    rewards_available: number;
    rewards_redeemed: number;
  };
  products: {
    top_products: Array<{
      product_id: string;
      name: string;
      product_code: string | null;
      quantity: number;
      revenue: number;
      orders: number;
    }>;
  };
};

export type ReferralMilestone = {
  threshold: number;
  label: string;
  behavior: string;
};

export type ReferralReferrer = {
  customer_id: string;
  customer_number: string | null;
  name: string;
  email: string | null;
  referral_code: string | null;
  membership: string;
  account_status: string | null;
  total: number;
  qualified: number;
  pending: number;
  converted: number;
  next_milestone: {
    threshold: number | null;
    label: string;
    remaining: number;
  };
  available_rewards: number;
  active_milestones: number;
  redeemed_rewards: number;
};

export type ReferralRecord = {
  id: string;
  referrer_id: string | null;
  referred_customer_id: string | null;
  referred_name: string | null;
  referred_email: string | null;
  referral_code: string | null;
  status: string | null;
  reward_type: string | null;
  reward_value: number | null;
  referred_at: string | null;
  converted_at: string | null;
  qualified_at: string | null;
  qualifying_order_number: string | null;
  consent_confirmed: boolean | null;
  notes: string | null;
  created_at: string;
  referrer_name: string;
  referrer_number: string | null;
  referred_customer_name: string | null;
};

export type CoreReferralAdminPayload = {
  generated_at: string;
  summary: {
    referrals: number;
    qualified: number;
    pending: number;
    converted: number;
    qualification_rate: number;
    conversion_rate: number;
    rewards_available: number;
    rewards_active: number;
    rewards_redeemed: number;
  };
  milestones: ReferralMilestone[];
  referrers: ReferralReferrer[];
  referrals: ReferralRecord[];
  rewards: Array<Record<string, unknown>>;
};

export type CoreNotification = {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  detail: string;
  href: string;
  created_at: string | null;
};

export type CoreNotificationsPayload = {
  generated_at: string;
  summary: { total: number; critical: number; warning: number; info: number };
  notifications: CoreNotification[];
};

export type NexusPushRecipient = {
  id: string;
  authUserId: string;
  customerNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  accountStatus: string;
  pushEnabled: boolean;
};

export type MessageTemplate = {
  id: string;
  name: string;
  message: string;
  category: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type InviteableProfile = {
  id: string;
  customer_number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  auth_user_id: string | null;
  account_status: string | null;
};

export type ActivationProfile = {
  id: string;
  customer_number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  account_status: string | null;
};

export type DiscountCodeRecord = {
  id: string;
  code: string;
  kind: "free_shipping" | "referral_bonus" | "new_customer" | "group_buy";
  discount_percent: number | null;
  shipping_discount: number | null;
  one_time: boolean;
  permanent: boolean;
  active: boolean;
  created_at: string;
  used_at: string | null;
};

export type CoreAuditEvent = {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Range = "7" | "30" | "90" | "all";
export const exactFlag = (value: string | undefined) => value === "true";
export function assertPayload(
  value: unknown,
  paths: string[],
): Record<string, any> {
  if (!value || typeof value !== "object" || (value as any).success !== true)
    throw new Error("The service returned an incomplete response.");
  const data = value as Record<string, any>;
  for (const path of paths) {
    const array = path.endsWith("[]"),
      p = array ? path.slice(0, -2) : path;
    const result = p.split(".").reduce((v, key) => v?.[key], data);
    if (
      array
        ? !Array.isArray(result)
        : result === null || result === undefined || typeof result !== "object"
    )
      throw new Error("The service returned an incomplete response.");
  }
  const finite = (item: unknown): boolean =>
    typeof item === "number"
      ? Number.isFinite(item)
      : Array.isArray(item)
        ? item.every(finite)
        : item && typeof item === "object"
          ? Object.values(item).every(finite)
          : true;
  if (!finite(data))
    throw new Error("The service returned invalid numeric data.");
  return data;
}
export function analyticsDays(days: AnalyticsDay[], range: Range) {
  return days.slice(range === "all" ? -90 : -Number(range));
}
export function matchesText(query: string, fields: unknown[]) {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    fields
      .filter((v) => v !== null && v !== undefined)
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}
// Server-supplied notification links are mapped to known native routes only.
export function notificationRoute(href: string) {
  const routes: Record<string, string> = {
    "#dashboard": "/(tabs)",
    "#orders": "/(tabs)/orders",
    "#checkout-pending": "/(tabs)/orders",
    "#customers": "/(tabs)/customers",
    "#catalog": "/catalog",
    "#finance": "/finance",
    "#analytics": "/analytics",
    "#referrals": "/referrals",
    "#notifications": "/notifications",
    "#admin-tools": "/admin-tools",
    "#audit": "/audit",
    "#account": "/(tabs)/account",
  };
  return routes[href] ?? null;
}
export function templateFields(
  name: string,
  category: string,
  message: string,
  active: boolean,
) {
  const fields = {
    name: name.trim(),
    category: category.trim(),
    message: message.trim(),
    active,
  };
  if (
    !fields.name ||
    fields.name.length > 120 ||
    fields.category.length > 80 ||
    !fields.message ||
    fields.message.length > 5000
  )
    throw new Error(
      "Enter a name (up to 120), category (up to 80) and message (up to 5000 characters).",
    );
  return fields;
}
export function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  return email;
}
export function stagingRecoveryUrl(value: string | undefined) {
  const allowed = "https://sbh-nexus-v2-staging.pages.dev";
  if (value !== allowed)
    throw new Error(
      "Configure the approved nexus staging origin before sending activation links.",
    );
  return allowed + "/?mode=invite";
}
export function allowedEmail(email: string, list: string | undefined) {
  const normalized = normalizedEmail(email);
  if (
    !(list || "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
      .includes(normalized)
  )
    throw new Error(
      "This address is not in the approved staging tester allowlist.",
    );
  return normalized;
}
export function pushFields(
  mode: "all" | "individual",
  customerId: string,
  title: string,
  message: string,
  recipients: NexusPushRecipient[],
  allowlist: string | undefined,
) {
  if (!["all", "individual"].includes(mode))
    throw new Error("Choose a valid audience.");
  const t = title.trim(),
    m = message.trim();
  if (!t || t.length > 80 || !m || m.length > 240)
    throw new Error(
      "Enter a title (up to 80) and message (up to 240 characters).",
    );
  const targets = recipients.filter(
    (p) =>
      p.pushEnabled &&
      p.accountStatus.toLowerCase() === "active" &&
      (mode === "all" || p.id === customerId),
  );
  if (!targets.length)
    throw new Error("Choose an active customer with push enabled.");
  targets.forEach((p) => allowedEmail(p.email, allowlist));
  return {
    mode,
    customerId: mode === "individual" ? customerId : null,
    title: t,
    message: m,
    url: "./",
  };
}

export function numericFields(object: unknown, fields: string[]) {
  if (
    !object ||
    typeof object !== "object" ||
    fields.some(
      (key) =>
        typeof (object as any)[key] !== "number" ||
        !Number.isFinite((object as any)[key]),
    )
  )
    throw new Error("The service returned incomplete numeric fields.");
}
export function recordFields(
  rows: unknown[],
  strings: string[],
  numbers: string[] = [],
) {
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      strings.some((key) => typeof (row as any)[key] !== "string")
    )
      throw new Error("The service returned incomplete record fields.");
    numericFields(row, numbers);
  }
}
