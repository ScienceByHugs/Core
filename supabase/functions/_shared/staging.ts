import { createClient } from 'npm:@supabase/supabase-js@2.117.1';

// Staging projects these functions may run on. Never add a production ref.
//   evyssawhlarqqhgyswhz  original shared staging project
//   leejnbrceylhdphmnxxr  nexus-core-2.0 (Science By Hugs - Pulse organization)
export const STAGING_REFS = new Set(['evyssawhlarqqhgyswhz', 'leejnbrceylhdphmnxxr']);
export const STAGING_REF = 'evyssawhlarqqhgyswhz';
export function isStagingProject(): boolean {
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];
  return !!ref && STAGING_REFS.has(ref);
}
const origins = new Set(['http://localhost:5173', 'http://localhost:5174', 'capacitor://localhost', 'https://sbh-nexus-v2-staging.pages.dev', 'https://sbh-core-v2-staging.pages.dev']);
export function runtimeKeys(kind: 'publishable' | 'secret'): string {
  const configured = Deno.env.get(kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS');
  if (configured) return configured;
  const key = Deno.env.get(kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Missing staging runtime key');
  return JSON.stringify({ default: key });
}

export function serveStaging(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async req => {
    const origin = req.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'http://localhost:5173',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
    const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
    if (!isStagingProject()) return respond({ error: 'Staging project mismatch' }, 503);
    if (origin && !origins.has(origin)) return respond({ error: 'Origin not approved for staging' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond({ error: 'POST required' }, 405);
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Authentication required' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, JSON.parse(runtimeKeys('publishable')).default, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return respond({ error: 'Invalid session' }, 401);
    if (!user.email_confirmed_at || !user.app_metadata.synthetic || user.app_metadata.environment !== 'staging') return respond({ error: 'Verified synthetic staging account required' }, 403);
    const body = await req.clone().json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'JSON object required' }, 400);
    // Day 2 restores read paths only. Mutation workflows arrive in later phases.
    if (body.action && body.action !== 'list') return respond({ error: 'This staging operation is not enabled yet' }, 409);
    try {
      const response = await handler(req);
      const resultHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) resultHeaders.set(key, value);
      return new Response(response.body, { status: response.status, headers: resultHeaders });
    } catch {
      return respond({ error: 'Staging service failed; retry or inspect its logs' }, 500);
    }
  });
}
