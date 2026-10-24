// Native counterpart of src/environment.ts in the web app: the staging build
// refuses production projects, production keys and non-HTTPS backends.
const productionProjects = new Set(['tkhcvmkejzaoervocnzk', 'pspiqukuhtazmkyfleii']);
const productionPublishableKey = 'sb_publishable_EcfrlkNHkSfJWgeSWjH2LA_3yDFTtBE';

export type CoreEnvironment = { supabaseUrl: string; publishableKey: string; projectRef: string };

export function validateEnvironment(input: {
  appEnv?: string;
  supabaseUrl?: string;
  expectedProjectRef?: string;
  publishableKey?: string;
}): CoreEnvironment {
  if (input.appEnv !== 'staging') throw new Error('core. Expo is staging-only: set EXPO_PUBLIC_APP_ENV=staging');
  const ref = String(input.expectedProjectRef || '').trim();
  if (!/^[a-z]{20}$/.test(ref)) throw new Error('EXPO_PUBLIC_EXPECTED_SUPABASE_REF must be the 20-letter staging project ref');
  if (productionProjects.has(ref)) throw new Error('Production Supabase projects are blocked in core. staging');
  let url: URL;
  try {
    url = new URL(String(input.supabaseUrl || '').trim());
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid URL');
  }
  if (url.protocol !== 'https:' || url.hostname !== `${ref}.supabase.co` || url.port || url.pathname !== '/') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be https://<staging ref>.supabase.co');
  }
  const key = String(input.publishableKey || '').trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || key === productionPublishableKey) {
    throw new Error('A staging publishable key is required; production, secret and legacy JWT keys are refused');
  }
  return { supabaseUrl: url.origin, publishableKey: key, projectRef: ref };
}

export const environment = validateEnvironment({
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  expectedProjectRef: process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
