import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/** Server-only Supabase client that intentionally bypasses dashboard RLS. */
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

