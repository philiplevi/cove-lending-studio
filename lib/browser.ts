'use client';
// Reserved for future authenticated browser features. Signup/login use same-origin
// /api/auth to avoid cross-origin browser restrictions and improve error reporting.
import { createBrowserClient } from '@supabase/ssr';
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase browser configuration is missing.');
  return createBrowserClient(url,key);
}
