// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to set the current user ID for RLS policies
export const setCurrentUser = async (userId) => {
  await supabase.rpc('set_config', {
    setting: 'app.current_user_id',
    value: userId,
    is_local: true
  });
};

// Alternative: Set user ID via headers (if using custom RLS approach)
export const createUserClient = (userId) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        'x-user-id': userId
      }
    }
  });
};

export default supabase;
