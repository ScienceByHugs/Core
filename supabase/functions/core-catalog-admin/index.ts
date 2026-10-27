// CORE catalog admin: owner/admin management of products, vendors, and order
// approvals on the 2.0 backend. Writes use the service role; the caller must be
// listed in public.app_admins (checked via private.is_app_admin).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  const { data: isAdmin } = await admin.rpc("is_app_admin", { p_uid: user.id });
  if (isAdmin !== true) return json({ error: "Administrator access required" }, 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "JSON object required" }, 400);
  const action = String(body.action || "");

  const audit = (a: string, entity: string, id: string | null, after: unknown) =>
    admin.from("core_audit_events").insert({
      actor_user_id: user.id, actor_email: user.email, actor_role: "admin",
      action: a, entity_type: entity, entity_id: id ?? "", after_data: after ?? {},
    });

  try {
    if (action === "list") {
      const [products, vendors, categories] = await Promise.all([
        admin.from("products").select(
          "id,name,product_code,research_name,category_id,description,purity,quantity," +
          "price,active,core_hidden,storefront_status,image_url,channels,vendor_id,updated_at," +
          "cost:product_costs(vendor_price)," +
          "vendor:vendors(id,name,shipping_fee,founding_member_free,active)," +
          "certifications:product_certifications(id,cert_type,purity,batch_lot,issued_on,expires_on,file_path,customer_visible)",
        ).order("name"),
        admin.from("vendors").select("id,name,shipping_fee,founding_member_free,active,notes").order("name"),
        admin.from("product_categories").select("id,name,slug,active").order("name"),
      ]);
      if (products.error) return json({ error: "Could not load products" }, 500);
      const rows = (products.data ?? []).map((p) => {
        const vendorPrice = Number((p.cost as { vendor_price?: number } | null)?.vendor_price ?? 0);
        const price = Number(p.price || 0);
        const markup = vendorPrice > 0 ? Math.round(((price - vendorPrice) / vendorPrice) * 1000) / 10 : null;
        return { ...p, vendor_price: vendorPrice, markup_percent: markup };
      });
      return json({ success: true, products: rows, vendors: vendors.data ?? [], categories: categories.data ?? [] });
    }

    if (action === "upsert_product") {
      const p = body.product ?? {};
      const row: Record<string, unknown> = {
        name: str(p.name), product_code: str(p.product_code), research_name: str(p.research_name),
        category_id: str(p.category_id), description: str(p.description), purity: str(p.purity),
        quantity: str(p.quantity), price: num(p.price) ?? 0, vendor_id: str(p.vendor_id),
        image_url: str(p.image_url), active: p.active !== false,
        core_hidden: p.core_hidden === true,
        storefront_status: str(p.storefront_status) ?? "available",
        channels: Array.isArray(p.channels) && p.channels.length ? p.channels : ["web", "ios"],
      };
      if (!row.name) return json({ error: "Product name is required" }, 400);
      if (!row.vendor_id) return json({ error: "A vendor is required so shipping is known" }, 400);

      let productId = str(p.id);
      if (productId) {
        const { error } = await admin.from("products").update(row).eq("id", productId);
        if (error) return json({ error: "Could not update product" }, 500);
      } else {
        const { data, error } = await admin.from("products").insert(row).select("id").single();
        if (error || !data) return json({ error: "Could not create product" }, 500);
        productId = data.id;
      }

      const vendorPrice = num(p.vendor_price);
      if (vendorPrice != null) {
        await admin.from("product_costs")
          .upsert({ product_id: productId, vendor_price: vendorPrice, updated_at: new Date().toISOString() });
      }
      await audit(p.id ? "product_updated" : "product_created", "product", productId, row);
      return json({ success: true, productId });
    }

    if (action === "delete_product") {
      const id = str(body.productId);
      if (!id) return json({ error: "Product ID required" }, 400);
      const { error } = await admin.from("products").delete().eq("id", id);
      if (error) return json({ error: "Could not delete product" }, 500);
      await audit("product_deleted", "product", id, {});
      return json({ success: true, deletedId: id });
    }

    if (action === "upsert_vendor") {
      const v = body.vendor ?? {};
      const row: Record<string, unknown> = {
        name: str(v.name), shipping_fee: num(v.shipping_fee) ?? 0,
        founding_member_free: v.founding_member_free === true,
        active: v.active !== false, notes: str(v.notes),
      };
      if (!row.name) return json({ error: "Vendor name is required" }, 400);
      const id = str(v.id);
      if (id) {
        const { error } = await admin.from("vendors").update(row).eq("id", id);
        if (error) return json({ error: "Could not update vendor" }, 500);
        await audit("vendor_updated", "vendor", id, row);
        return json({ success: true, vendorId: id });
      }
      const { data, error } = await admin.from("vendors").insert(row).select("id").single();
      if (error || !data) return json({ error: "Could not create vendor" }, 500);
      await audit("vendor_created", "vendor", data.id, row);
      return json({ success: true, vendorId: data.id });
    }

    if (action === "set_order_approval") {
      const id = str(body.orderId);
      const decision = String(body.decision || "");
      if (!id || !["approved", "declined"].includes(decision)) {
        return json({ error: "orderId and decision (approved|declined) required" }, 400);
      }
      const update: Record<string, unknown> = {
        approval_status: decision,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        decline_reason: decision === "declined" ? str(body.reason) : null,
      };
      const { error } = await admin.from("orders").update(update).eq("id", id);
      if (error) return json({ error: "Could not update order" }, 500);
      await audit("order_" + decision, "order", id, update);
      return json({ success: true, orderId: id, approval_status: decision });
    }

    return json({ error: "Unknown action" }, 400);
  } catch {
    return json({ error: "Catalog admin service failed" }, 500);
  }
});
