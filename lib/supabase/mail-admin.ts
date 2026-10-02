import "server-only";
import { createClient } from "@supabase/supabase-js";

export function mailAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure the server-only Supabase key for mail tracking");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
