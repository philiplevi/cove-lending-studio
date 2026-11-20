import {createHash, timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {supabaseSettings} from '@/lib/runtime-config';
import {fullDataset} from '@/lib/read-ledger';
import {monthlyReport, reportingDates} from '@/lib/folio-monthly';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) =>
  Response.json(body, {status, headers: {'Cache-Control':'private, no-store'}});
const digest = (value: string) => createHash('sha256').update(value).digest();

export async function GET(request: Request) {
  const token = process.env.FOLIO_REPORT_TOKEN;
  const workspace = process.env.FOLIO_WORKSPACE_ID;
  const email = process.env.FOLIO_VIEWER_EMAIL;
  const password = process.env.FOLIO_VIEWER_PASSWORD;
  if (!token || token.length < 32 || !workspace || !email || !password) return reply({error:'Reporting unavailable'}, 503);
  if (!timingSafeEqual(digest(request.headers.get('Authorization') ?? ''), digest('Bearer ' + token))) {
    return reply({error:'Unauthorized'}, 401);
  }
  const month = new URL(request.url).searchParams.get('month') ?? '';
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Manila'}).format(new Date());
  const dates = reportingDates(month, today);
  if (!dates) return reply({error:'Invalid reporting month'}, 400);
  try {
    const {url, key} = supabaseSettings();
    const client = createClient(url, key, {auth:{persistSession:false, autoRefreshToken:false}});
    const {data, error} = await client.auth.signInWithPassword({email, password});
    if (error || !data.user) return reply({error:'Reporting viewer unavailable'}, 503);
    const membership = await client.from('workspace_members').select('role')
      .eq('workspace_id', workspace).eq('user_id', data.user.id).maybeSingle();
    if (membership.error || membership.data?.role !== 'viewer') return reply({error:'Reporting viewer unavailable'}, 503);
    return reply(monthlyReport(await fullDataset({client,workspace}), month, dates));
  } catch {
    return reply({error:'Monthly statement unavailable'}, 503);
  }
}
