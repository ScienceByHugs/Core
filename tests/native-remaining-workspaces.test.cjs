const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
function load(file, imports = {}, env = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../expo/src/services/", file),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const ctx = {
    exports: {},
    require: (n) => imports[n],
    process: { env },
    Error,
    Date,
    URL,
  };
  vm.runInNewContext(code, ctx);
  return ctx.exports;
}
const model = load("workspace-models.ts");
const recipient = {
  id: "c-1",
  authUserId: "u-1",
  email: "tester@example.test",
  accountStatus: "Active",
  pushEnabled: true,
};
function api(fn, env = {}, auth) {
  return load(
    "workspaces.ts",
    {
      "./invoke": { invokeCore: fn },
      "./workspace-models": model,
      "@/lib/supabase": { supabase: { auth: auth || {} } },
      "./customers": {
        loadCustomers: async () => ({ customers: [], memberships: [] }),
      },
    },
    env,
  );
}
const enabled = {
  EXPO_PUBLIC_ENABLE_ADMIN_WRITES: "true",
  EXPO_PUBLIC_ENABLE_TEST_MESSAGES: "true",
  EXPO_PUBLIC_TEST_RECIPIENT_EMAILS: "tester@example.test",
  EXPO_PUBLIC_NEXUS_STAGING_ORIGIN: "https://sbh-nexus-v2-staging.pages.dev",
};
function analytics() {
  const period = {
    days: 30,
    orders: 0,
    paid_orders: 0,
    revenue: 0,
    average_order: 0,
    new_customers: 0,
    purchasing_customers: 0,
    repeat_customers: 0,
  };
  return {
    success: true,
    generated_at: "2026-10-25T12:00:00Z",
    headline: {
      paid_revenue: 19.95,
      paid_orders: 1,
      average_paid_order: 19.95,
      customers: 1,
      active_customers: 1,
      purchasing_customers: 1,
      repeat_customers: 0,
      products: 1,
      active_products: 1,
    },
    periods: { 7: period, 30: period, 90: period, all: period },
    series: { daily_90: [] },
    customers: { membership_mix: [], top_customers: [] },
    orders: { status_mix: [], payment_mix: [] },
    referrals: {
      total: 0,
      qualified: 0,
      converted: 0,
      qualification_rate: 0,
      conversion_rate: 0,
      rewards_available: 0,
      rewards_redeemed: 0,
    },
    products: { top_products: [] },
  };
}
function referrals() {
  return {
    success: true,
    summary: {
      referrals: 0,
      qualified: 0,
      pending: 0,
      converted: 0,
      qualification_rate: 0,
      conversion_rate: 0,
      rewards_available: 0,
      rewards_active: 0,
      rewards_redeemed: 0,
    },
    milestones: [],
    referrers: [],
    referrals: [],
    rewards: [],
  };
}
test("analytics ranges keep all-time KPIs separate from the latest 90 daily records", () => {
  const days = Array.from({ length: 120 }, (_, i) => ({
    date: String(i),
    revenue: 19.95,
  }));
  for (const [range, count] of [
    ["7", 7],
    ["30", 30],
    ["90", 90],
    ["all", 90],
  ]) {
    const result = model.analyticsDays(days, range);
    assert.equal(result.length, count);
    assert.equal(result[result.length - 1].date, "119");
  }
  assert.equal(days.length, 120);
});
test("workspace validation rejects missing nested data and nonfinite numbers", () => {
  assert.throws(
    () => model.assertPayload({ success: true }, ["summary", "records[]"]),
    /incomplete/,
  );
  assert.throws(
    () =>
      model.assertPayload({ success: true, summary: { count: NaN } }, [
        "summary",
      ]),
    /numeric/,
  );
  assert.throws(() => model.numericFields({}, ["revenue"]), /numeric/);
  assert.throws(() => model.recordFields([{}], ["id"]), /record/);
});
test("operational links map only known internal hashes and never external/script URLs", () => {
  assert.equal(model.notificationRoute("#audit"), "/audit");
  assert.equal(model.notificationRoute("#catalog"), "/catalog");
  for (const href of [
    "https://example.test",
    "#operations",
    "javascript:alert(1)",
    "/admin-tools",
    "#unknown",
  ])
    assert.equal(model.notificationRoute(href), null);
});
test("referral/audit search finds action and operator fields with trimmed case-insensitive matching", () => {
  assert.equal(
    model.matchesText(" ADMIN ", [
      "Customer.notes.update",
      "admin@example.test",
    ]),
    true,
  );
  assert.equal(model.matchesText("SKU-2", [null, "SKU-1"]), false);
  assert.equal(model.matchesText("", [null]), true);
});
test("push composition excludes ineligible recipients and requires each actual target in the synthetic allowlist", () => {
  const body = model.pushFields(
    "individual",
    "c-1",
    " Title ",
    " Message ",
    [recipient],
    "tester@example.test",
  );
  assert.equal(body.title, "Title");
  assert.equal(body.customerId, "c-1");
  assert.throws(
    () =>
      model.pushFields(
        "individual",
        "c-1",
        "t",
        "m",
        [{ ...recipient, pushEnabled: false }],
        "tester@example.test",
      ),
    /active/,
  );
  assert.throws(
    () =>
      model.pushFields(
        "all",
        "",
        "t",
        "m",
        [
          recipient,
          { ...recipient, id: "c-2", email: "outsider@example.test" },
        ],
        "tester@example.test",
      ),
    /allowlist/,
  );
  assert.throws(
    () =>
      model.pushFields(
        "all",
        "",
        "x".repeat(81),
        "m",
        [recipient],
        "tester@example.test",
      ),
    /title/,
  );
});
test("activation redirects accept only the exact approved staging origin", () => {
  assert.equal(
    model.stagingRecoveryUrl(enabled.EXPO_PUBLIC_NEXUS_STAGING_ORIGIN),
    "https://sbh-nexus-v2-staging.pages.dev/?mode=invite",
  );
  for (const value of [
    undefined,
    "https://nexus.sciencebyhugs.com",
    "https://sbh-nexus-v2-staging.pages.dev.evil.test",
    "https://sbh-nexus-v2-staging.pages.dev/?x=1",
  ])
    assert.throws(() => model.stagingRecoveryUrl(value), /staging origin/);
});
test("default-off flags prevent every admin write, push and authentication email request", async () => {
  let calls = 0;
  const a = api(
    async () => {
      calls++;
    },
    {},
    {
      resetPasswordForEmail: async () => {
        calls++;
      },
    },
  );
  for (const work of [
    () => a.saveTemplate("name", "", "message", true),
    () => a.generateCode("free_shipping"),
    () => a.queueTestPush("all", "", "t", "m", [recipient]),
    () =>
      a.inviteTester({
        ...recipient,
        auth_user_id: null,
        account_status: "Active",
      }),
    () => a.activateTester(recipient.email),
    () => a.updateAdminCustomer("c-1", "update_account_status", "Suspended"),
  ])
    await assert.rejects(work(), /disabled/);
  assert.equal(calls, 0);
});
test("all workspace read contracts accept empty records without manufacturing totals", async () => {
  const responses = {
    "core-analytics": analytics(),
    "core-referrals-admin": referrals(),
    "core-notifications": {
      success: true,
      summary: { total: 0, critical: 0, warning: 0, info: 0 },
      notifications: [],
    },
    "core-audit": { success: true, events: [] },
    "core-nexus-push": { success: true, recipients: [] },
    "core-admin-tools": {
      success: true,
      templates: [],
      inviteable_profiles: [],
    },
    "core-discount-codes": { success: true, codes: [] },
  };
  const calls = [];
  const a = api(async (name, body) => {
    calls.push([name, body]);
    return responses[name];
  });
  assert.equal((await a.loadAnalytics()).headline.paid_revenue, 19.95);
  assert.equal((await a.loadReferrals()).summary.qualified, 0);
  assert.equal((await a.loadNotifications()).notifications.length, 0);
  assert.equal((await a.loadAudit()).length, 0);
  assert.equal((await a.loadRecipients()).length, 0);
  assert.equal((await a.loadAdminWorkspace()).templates.length, 0);
  assert.equal((await a.loadCodes()).length, 0);
  assert.ok(calls.every(([, b]) => !b || b.action === "list"));
});
test("malformed analytics/referral/notification/audit records fail visibly", async () => {
  const bad = analytics();
  bad.headline.paid_revenue = "19.95";
  await assert.rejects(api(async () => bad).loadAnalytics(), /numeric/);
  const r = referrals();
  r.referrers = [{ customer_id: "c" }];
  await assert.rejects(
    api(async () => r).loadReferrals(),
    /record|numeric|milestone/,
  );
  await assert.rejects(
    api(async () => ({
      success: true,
      summary: { total: 1, critical: 0, warning: 0, info: 1 },
      notifications: [
        {
          id: "n",
          severity: "unknown",
          category: "x",
          title: "t",
          detail: "d",
          href: "#audit",
        },
      ],
    })).loadNotifications(),
    /severity/,
  );
  await assert.rejects(
    api(async () => ({ success: true, events: [{}] })).loadAudit(),
    /record/,
  );
});
test("admin writes use explicit actions without retries and require confirmed saved identifiers", async () => {
  const calls = [];
  const a = api(async (...args) => {
    calls.push(args);
    return {
      success: true,
      template: { id: "t-1" },
      code: { id: "d-1", code: "SBH123" },
      customer: { id: "c-1" },
    };
  }, enabled);
  await a.saveTemplate(" Name ", " General ", " Message ", true, "t-1");
  await a.generateCode("referral_bonus");
  await a.updateAdminCustomer("c-1", "update_membership", "m-1", ["m-1"]);
  await a.updateAdminCustomer("c-1", "update_account_status", "Suspended");
  await a.updateAdminCustomer("c-1", "update_email", " TESTER@example.test ");
  const c = JSON.parse(JSON.stringify(calls));
  assert.deepEqual(
    c.map((c) => c[1].action),
    [
      "save_template",
      "generate",
      "update_membership",
      "update_account_status",
      "update_email",
    ],
  );
  assert.ok(c.every((c) => c[2].retry === false));
  assert.equal(c[0][1].name, "Name");
  await assert.rejects(
    api(
      async () => ({ success: true, template: { id: "wrong" } }),
      enabled,
    ).saveTemplate("n", "", "m", true, "t-1"),
    /confirmed/,
  );
});
test("invalid template, membership, account status, email and code inputs cannot reach the server", async () => {
  let calls = 0;
  const a = api(async () => {
    calls++;
    return {};
  }, enabled);
  for (const work of [
    () => a.saveTemplate("", "", "m", true),
    () => a.generateCode("other"),
    () => a.updateAdminCustomer("c", "update_membership", "unknown", ["m"]),
    () => a.updateAdminCustomer("c", "update_account_status", "Owner"),
    () => a.updateAdminCustomer("c", "update_email", "real@example.test"),
  ])
    await assert.rejects(work());
  assert.equal(calls, 0);
});
test("activation and invitation requests use approved testers only with no production redirect", async () => {
  const resets = [],
    writes = [];
  const a = api(
    async (...args) => {
      writes.push(args);
      return { success: true };
    },
    enabled,
    {
      resetPasswordForEmail: async (...args) => {
        resets.push(args);
        return { error: null };
      },
    },
  );
  await a.activateTester(" TESTER@example.test ");
  assert.deepEqual(JSON.parse(JSON.stringify(resets)), [
    [
      "tester@example.test",
      { redirectTo: "https://sbh-nexus-v2-staging.pages.dev/?mode=invite" },
    ],
  ]);
  await a.inviteTester({
    id: "c-1",
    email: recipient.email,
    auth_user_id: null,
    account_status: "Active",
  });
  assert.equal(writes[0][1].customerId, "c-1");
  assert.equal(writes[0][2].retry, false);
  await assert.rejects(
    a.inviteTester({
      id: "c",
      email: recipient.email,
      auth_user_id: "already-linked",
      account_status: "Active",
    }),
    /unclaimed/,
  );
  await assert.rejects(
    a.activateTester("unapproved@example.test"),
    /allowlist/,
  );
  assert.equal(resets.length, 1);
});
test("push reports queue acceptance only and rejects ambiguous results without automatic resends", async () => {
  const calls = [];
  const a = api(async (...args) => {
    calls.push(args);
    return { success: true, queued: 1 };
  }, enabled);
  assert.equal(
    await a.queueTestPush("individual", "c-1", "t", "m", [recipient]),
    1,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].retry, false);
  await assert.rejects(
    api(async () => ({ success: true }), enabled).queueTestPush(
      "individual",
      "c-1",
      "t",
      "m",
      [recipient],
    ),
    /confirmed/,
  );
});
test("read permission failures and write network failures propagate without false success", async () => {
  const a = api(async () => {
    throw new Error("Access denied");
  }, enabled);
  await assert.rejects(a.loadAudit(), /Access denied/);
  await assert.rejects(
    a.saveTemplate("Name", "", "Message", true),
    /Access denied/,
  );
});
