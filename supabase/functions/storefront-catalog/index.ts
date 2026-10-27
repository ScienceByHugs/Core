// NEXUS storefront read. Returns the live catalog for a sales channel.
// Never returns vendor cost: cost lives in product_costs and is not selected here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const channel = body?.channel === "ios" ? "ios" : "web";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin
    .from("products")
    .select(
      "id,name,product_code,research_name,description,purity,quantity,price,image_url,channels," +
      "category:product_categories(name)," +
      "certifications:product_certifications(cert_type,purity,batch_lot,issued_on,expires_on,file_path,customer_visible)",
    )
    .eq("active", true)
    .eq("core_hidden", false)
    .contains("channels", [channel])
    .order("name");

  if (error) return json({ error: "Could not load catalog" }, 500);

  const products = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    productCode: p.product_code,
    researchName: p.research_name,
    description: p.description,
    purity: p.purity,
    quantity: p.quantity,
    price: Number(p.price || 0),
    imageUrl: p.image_url,
    category: (p.category as { name?: string } | null)?.name ?? null,
    certifications: ((p.certifications as Array<Record<string, unknown>>) ?? [])
      .filter((c) => c.customer_visible === true)
      .map((c) => ({
        type: c.cert_type,
        purity: c.purity,
        batch: c.batch_lot,
        issuedOn: c.issued_on,
        expiresOn: c.expires_on,
        filePath: c.file_path,
      })),
  }));

  return json({ success: true, channel, products });
});
