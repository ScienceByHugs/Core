import { runtimeKeys, serveStaging } from '../_shared/staging.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const blank = (value: unknown) => String(value ?? "").trim() === "";

serveStaging(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKeys = JSON.parse(runtimeKeys("publishable")!);
  const secretKeys = JSON.parse(runtimeKeys("secret")!);

  const userClient = createClient(supabaseUrl, publishableKeys.default, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, secretKeys.default, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  const role = String(user.app_metadata?.role || "").trim().toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    return json({ error: "Core administrator access required" }, 403);
  }

  const [productsResult, categoriesResult, syncResult] = await Promise.all([
    admin.from("products")
      .select("id,product_code,sku,name,research_name,category_id,description,purity,quantity,lot_number,coa_url,price,active,core_hidden,featured,sort_order,image_url,product_type,shipping_from,source,storefront_status,source_key,sync_source,last_sync_run_id,source_synced_at,created_at,updated_at,publication_status,is_synthetic,authenticity_verified,eligibility_verified,imagery_verified,verification_evidence,inventory:product_inventory(*)")
      .order("active", { ascending: false })
      .order("featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500),
    admin.from("product_categories")
      .select("id,name,slug,description,sort_order,active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin.from("catalog_sync_runs")
      .select("id,source,status,received_count,upserted_count,deactivated_count,error_message,started_at,completed_at")
      .order("started_at", { ascending: false })
      .limit(24),
  ]);

  if (productsResult.error) return json({ error: "Could not load products" }, 500);
  if (categoriesResult.error) return json({ error: "Could not load categories" }, 500);
  if (syncResult.error) return json({ error: "Could not load catalog sync history" }, 500);

  const categoryById = new Map((categoriesResult.data || []).map(category => [String(category.id), category]));
  const rawProducts = productsResult.data || [];
  const products = rawProducts.map(product => ({
    ...product,
    category: product.category_id ? categoryById.get(String(product.category_id)) || null : null,
  }));

  const activeProducts = products.filter(product => product.active);
  const metadataFields = [
    ["product_code", "Product code"],
    ["research_name", "Research name"],
    ["purity", "Purity"],
    ["quantity", "Quantity"],
    ["lot_number", "Lot number"],
    ["coa_url", "COA"],
  ] as const;

  const actionQueue = activeProducts.map(product => {
    const missing = metadataFields
      .filter(([key]) => blank(product[key]))
      .map(([key, label]) => ({ key, label }));

    return {
      product_id: product.id,
      name: product.name,
      product_code: product.product_code,
      category_name: product.category?.name || null,
      source_synced_at: product.source_synced_at,
      missing_fields: missing,
      missing_count: missing.length,
      priority: missing.some(field => field.key === "coa_url") ? "high" : missing.length >= 3 ? "medium" : "low",
    };
  }).filter(item => item.missing_count > 0)
    .sort((a, b) => b.missing_count - a.missing_count || a.name.localeCompare(b.name));

  const syncRuns = syncResult.data || [];
  const latestSync = syncRuns[0] || null;
  const latestSyncAt = latestSync?.completed_at || latestSync?.started_at || null;
  const ageMinutes = latestSyncAt
    ? Math.max(0, Math.round((Date.now() - new Date(latestSyncAt).getTime()) / 60000))
    : null;
  const feedStale = ageMinutes === null || ageMinutes > 120 || String(latestSync?.status || "").toLowerCase() !== "completed";
  const recentRuns = syncRuns.slice(0, 6);
  const recentSuccessfulRuns = recentRuns.filter(run => String(run.status || "").toLowerCase() === "completed").length;

  const discrepancyQueue = products.flatMap(product => {
    const issues: string[] = [];
    const storefront = String(product.storefront_status || "").trim().toLowerCase();

    if (!product.category_id) issues.push("Missing vendor category");
    if (!product.source_synced_at) issues.push("Never synced from vendor feed");
    if (product.active && storefront !== "available") issues.push("Active flag disagrees with storefront status");
    if (!product.active && storefront === "available") issues.push("Inactive flag disagrees with storefront status");
    if (
      latestSync?.id &&
      product.sync_source === latestSync.source &&
      product.last_sync_run_id &&
      product.last_sync_run_id !== latestSync.id &&
      product.active
    ) issues.push("Active product did not participate in latest vendor sync");

    return issues.length ? [{
      product_id: product.id,
      name: product.name,
      category_name: product.category?.name || null,
      storefront_status: product.storefront_status,
      active: product.active,
      source_synced_at: product.source_synced_at,
      issues,
    }] : [];
  });

  const missingCounts = Object.fromEntries(
    metadataFields.map(([key]) => [
      key,
      activeProducts.filter(product => blank(product[key])).length,
    ]),
  );

  const completeMetadata = activeProducts.filter(product =>
    metadataFields.every(([key]) => !blank(product[key]))
  ).length;
  const possibleMetadataPoints = activeProducts.length * metadataFields.length;
  const completedMetadataPoints = possibleMetadataPoints -
    Object.values(missingCounts).reduce((sum, count) => sum + Number(count), 0);
  const completenessPercent = possibleMetadataPoints
    ? Math.round((completedMetadataPoints / possibleMetadataPoints) * 100)
    : 100;

  const metrics = {
    total: products.length,
    active: activeProducts.length,
    available: products.filter(product => String(product.storefront_status || "").toLowerCase() === "available" && !product.core_hidden).length,
    hidden: products.filter(product => Boolean(product.core_hidden)).length,
    featured: products.filter(product => product.featured).length,
    with_coa: products.filter(product => Boolean(product.coa_url)).length,
    missing_category: products.filter(product => !product.category_id).length,
    metadata_complete: completeMetadata,
    metadata_completeness_percent: completenessPercent,
    action_queue: actionQueue.length,
    discrepancy_count: discrepancyQueue.length,
  };

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    metrics,
    operations: {
      feed: {
        status: feedStale ? "attention" : "healthy",
        stale: feedStale,
        latest_sync_at: latestSyncAt,
        age_minutes: ageMinutes,
        latest_run_status: latestSync?.status || null,
        source: latestSync?.source || null,
        latest_received_count: latestSync?.received_count ?? null,
        latest_upserted_count: latestSync?.upserted_count ?? null,
        latest_deactivated_count: latestSync?.deactivated_count ?? null,
        recent_successful_runs: recentSuccessfulRuns,
        recent_run_count: recentRuns.length,
        stale_after_minutes: 120,
      },
      metadata: {
        active_products: activeProducts.length,
        complete_products: completeMetadata,
        completeness_percent: completenessPercent,
        missing: missingCounts,
      },
      action_queue: actionQueue,
      discrepancies: discrepancyQueue,
    },
    categories: categoriesResult.data || [],
    products,
    sync_runs: syncRuns,
  });
});