import {NextRequest,NextResponse} from 'next/server';
import {createServerClient, type CookieOptions} from '@supabase/ssr';
import {configExplanation,readableAuthError,supabaseSettings} from '@/lib/runtime-config';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type CookieWrite = {name: string; value: string; options?: CookieOptions};

function respond(data: unknown, status: number, writes: CookieWrite[] = []) {
  const response = NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  for(const cookie of writes) response.cookies.set(cookie.name,cookie.value,cookie.options);
  return response;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return respond({error:'Invalid request origin.'},403);
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return respond({error:'JSON request required.'},415);
  if (Number(request.headers.get('content-length') || 0) > 4096) return respond({error:'Request too large.'},413);

  let action: 'signup'|'signin'; let email: string; let password: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body!=='object' || Array.isArray(body)) return respond({error:'Invalid request.'},400);
    const params = body as Record<string,unknown>;
    if (params.action!=='signup' && params.action!=='signin') return respond({error:'Unknown authentication action.'},400);
    action=params.action;
    email=String(params.email ?? '').trim().toLowerCase();
    password=String(params.password ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || password.length<8 || password.length>128) {
      return respond({error:'Enter a valid email and a password of 8–128 characters.'},400);
    }
  } catch {return respond({error:'Malformed JSON request.'},400);}

  let settings;
  try { settings=supabaseSettings(); }
  catch(error) {return respond({error:error instanceof Error?error.message:configExplanation('missing_url')},503);}
  const writes: CookieWrite[]=[];
  const supabase = createServerClient(settings.url,settings.key,{
    cookies: {
      getAll() {return request.cookies.getAll();},
      setAll(toSet: CookieWrite[]) {
        writes.push(...toSet);
        for (const cookie of toSet) request.cookies.set(cookie.name,cookie.value);
      }
    }
  });

  try {
    const result = action==='signup'
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password});
    if (result.error) {
      const clean=readableAuthError(result.error);
      return respond({error:clean.message},clean.status,writes);
    }
    if(action==='signup' && !result.data.session) {
      return respond({ok:true,needsVerification:true,message:'Check your email for the verification link, then sign in. If no email arrives, inspect Supabase Authentication email settings.'},200,writes);
    }
    return respond({ok:true,needsVerification:false},200,writes);
  } catch(error) {
    const clean=readableAuthError(error);
    return respond({error:clean.message},clean.status,writes);
  }
}
