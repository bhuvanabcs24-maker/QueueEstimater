import { getSupabaseAdmin, supabase } from './supabase';
import { User } from '@supabase/supabase-js';

/**
 * Extracts and verifies the authenticated Supabase user from the HTTP Request Authorization header.
 * Ensures the API route cannot be spoofed by an unauthenticated client or fabricated user_id.
 */
export async function getAuthenticatedUser(request: Request): Promise<User | null> {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return null;
    }

    // Try validating with Supabase Admin client if available
    const admin = getSupabaseAdmin();
    if (admin) {
      const { data: { user }, error } = await admin.auth.getUser(token);
      if (!error && user) {
        return user;
      }
    }

    // Fallback to standard Supabase client
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return user;
    }

    return null;
  } catch (err) {
    console.error('Error validating authentication token:', err);
    return null;
  }
}
