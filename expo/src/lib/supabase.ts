import { createClient } from '@supabase/supabase-js';
import { environment } from '@/config/environment';
import { authStorage } from './privateStorage';

export const supabase = createClient(environment.supabaseUrl, environment.publishableKey, {
  auth: {
    storage: authStorage,
    storageKey: 'sbh-core-expo-v2-staging-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
