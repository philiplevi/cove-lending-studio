import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseSettings } from './runtime-config';

export async function createClient() {
  const cookieStore = await cookies();
  const {url,key} = supabaseSettings();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(toSet: {name: string; value: string; options?: CookieOptions}[]) {
        try {
          for (const {name,value,options} of toSet) cookieStore.set(name,value,options);
        } catch {
          // Reading auth inside a Server Component cannot write cookies;
          // the middleware refreshes cookies for page requests.
        }
      }
    }
  });
}
