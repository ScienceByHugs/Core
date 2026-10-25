// core. review queue for research-account applications. Staging only.
// Actions: list (by status), document (short-lived link to the uploaded file),
// decide (approve or deny; the database re-checks the reviewer and audits it).
import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { isStagingProject, runtimeKeys } from '../_shared/staging.ts';

const origins = new Set(['http://localhost:5173', 'http://localhost:5174', 'capacitor://localhost', 'https://sbh-core-v2-staging.pages.dev']);
const statuses = new Set(['pending', 'approved', 'denied', 'withdrawn']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'http://localhost:5174',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!isStagingProject()) return json({ error: 'Staging project mismatch' }, 503);
  if (origin && !origins.has(origin)) return json({ error: 'Origin not approved for staging' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, JSON.parse(runtimeKeys('publishable')).default, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ error: 'Invalid session' }, 401);
    const role = String(user.app_metadata?.role ?? '').toLowerCase();
    if (!user.email_confirmed_at || user.app_metadata?.environment !== 'staging' || user.app_metadata?.synthetic !== true || !['owner', 'admin'].includes(role)) {
      return json({ error: 'Verified staging administrator required' }, 403);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'JSON object required' }, 400);
    const admin = createClient(url, JSON.parse(runtimeKeys('secret')).default, { auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === 'list') {
      const status = typeof body.status === 'string' && statuses.has(body.status) ? body.status : 'pending';
      const { data, error: listError } = await admin.from('research_applications')
        .select('id,status,institution_name,department,role_title,principal_investigator,institutional_email,email_domain,research_summary,document_path,terms_version,free_domain_override,submitted_at,reviewed_at,decision_reason,expires_at')
        .eq('status', status).order('submitted_at', { ascending: status === 'pending' }).limit(200);
      if (listError) return json({ error: 'Could not load applications' }, 500);
      return json({ success: true, applications: data ?? [] });
    }

    if (body.action === 'document') {
      if (typeof body.applicationId !== 'string' || !uuid.test(body.applicationId)) return json({ error: 'Application ID required' }, 400);
      const { data: row, error: rowError } = await admin.from('research_applications').select('document_path').eq('id', body.applicationId).maybeSingle();
      if (rowError) return json({ error: 'Could not load application' }, 500);
      if (!row?.document_path) return json({ error: 'No document was uploaded' }, 404);
      const { data: signed, error: signError } = await admin.storage.from('research-documents').createSignedUrl(row.document_path, 300);
      if (signError || !signed) return json({ error: 'Could not open document' }, 500);
      return json({ success: true, url: signed.signedUrl, expiresInSeconds: 300 });
    }

    if (body.action === 'decide') {
      if (typeof body.applicationId !== 'string' || !uuid.test(body.applicationId)) return json({ error: 'Application ID required' }, 400);
      if (body.decision !== 'approved' && body.decision !== 'denied') return json({ error: 'Decision must be approved or denied' }, 400);
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 2000) : null;
      const { data, error: decideError } = await admin.rpc('review_research_application', {
        p_actor: user.id, p_application_id: body.applicationId, p_decision: body.decision,
        p_reason: reason, p_allow_free_domain: body.allowFreeDomain === true,
      });
      if (decideError) return json({ success: false, error: decideError.message }, 400);
      return json({ success: true, application: data });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch {
    return json({ success: false, error: 'Review service failed; retry or inspect logs' }, 500);
  }
});
