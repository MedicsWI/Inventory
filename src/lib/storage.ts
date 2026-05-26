// Supabase Storage helper — server-only (uses service role key).
// Used by /api/upload to put item / location photos in the bucket.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getStorageClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase storage not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "inventory-photos";
