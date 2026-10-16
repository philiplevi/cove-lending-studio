/** Server/browser-safe checks. Never log or return a Supabase API key. */
export type ConfigIssue = 'missing_url'|'invalid_url'|'missing_key'|'forbidden_key'|null;

export function validateSupabaseConfig(url: string | undefined, key: string | undefined): ConfigIssue {
  if (!url || !url.trim()) return 'missing_url';
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname !== '/' || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
      return 'invalid_url';
    }
  } catch { return 'invalid_url'; }
  if (!key || !key.trim() || key.includes('YOUR_')) return 'missing_key';
  if (key.startsWith('sb_secret_') || key.includes('service_role')) return 'forbidden_key';
  return null;
}

export function configExplanation(issue: ConfigIssue): string {
  switch (issue) {
    case 'missing_url': return 'Supabase project URL is missing. Set NEXT_PUBLIC_SUPABASE_URL in Vercel Production.';
    case 'invalid_url': return 'Supabase project URL is invalid. It should look like https://your-project.supabase.co (no trailing path).';
    case 'missing_key': return 'Supabase publishable/anon key is missing. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Production.';
    case 'forbidden_key': return 'A privileged Supabase key was supplied. Use a publishable/anon key, never a secret or service-role key.';
    default: return 'Configuration present.';
  }
}

export function supabaseSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const issue = validateSupabaseConfig(url,key);
  if (issue) throw new Error(configExplanation(issue));
  return { url: url!, key: key! };
}

/** Convert connection failures into operator-facing errors without exposing credentials. */
export function readableAuthError(error: unknown): { message: string; status: number } {
  const e = error as {message?: unknown; status?: unknown; code?: unknown} | null;
  const message = typeof e?.message === 'string' ? e.message : 'Unexpected authentication error';
  const code = String(e?.code ?? '');
  if (/fetch failed|failed to fetch|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) {
    return {message:'The Cove server could not contact Supabase. Check the project URL, whether the Supabase project is active, and the Connection Check on this page.',status:503};
  }
  if (/database error saving new user|unexpected_failure/i.test(message) || code==='unexpected_failure') {
    return {message:'Supabase rejected account creation while saving the new user. Check Auth logs and the Cove workspace trigger in Supabase.',status:502};
  }
  if (/email rate limit/i.test(message)) return {message:'Email sending has reached the Supabase rate limit. Try later or configure SMTP.',status:429};
  if (/signup is disabled|signups not allowed/i.test(message)) return {message:'Account creation is disabled in Supabase Auth settings.',status:403};
  const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 500 ? e.status : 400;
  return {message:message.slice(0,300),status};
}
