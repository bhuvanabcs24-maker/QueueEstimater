import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Fallback values for building stage to prevent crash if not set yet
const activeUrl = supabaseUrl || 'https://placeholder-project.supabase.co';
const activeAnonKey = supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(activeUrl, activeAnonKey);

export const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase Admin requested but credentials (URL/service role key) are missing.');
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
