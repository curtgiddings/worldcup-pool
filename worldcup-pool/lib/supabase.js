import { createClient } from "@supabase/supabase-js";

// Single shared browser client. Session is persisted in the browser,
// so a manager stays logged in across visits.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
