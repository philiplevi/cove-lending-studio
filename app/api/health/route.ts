import {NextResponse} from 'next/server';
import {configExplanation,validateSupabaseConfig} from '@/lib/runtime-config';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Public operational check. Never return keys, auth tokens, project identifiers or PII.
export async function GET() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const issue=validateSupabaseConfig(url,key);
  if(issue) return NextResponse.json({status:'configuration_error',message:configExplanation(issue)},{status:503,headers:{'Cache-Control':'no-store'}});
  try {
    const check = await fetch(new URL('/auth/v1/health',url),{
      method:'GET',headers:{'apikey':key!},signal:AbortSignal.timeout(6500),cache:'no-store'
    });
    if (!check.ok) return NextResponse.json({status:'upstream_error',message:`Supabase responded with HTTP ${check.status}. Check project availability and URL.`},{status:503,headers:{'Cache-Control':'no-store'}});
    return NextResponse.json({status:'online',message:'The application server can reach Supabase. If signup still fails, inspect the authentication response and Auth logs.'},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return NextResponse.json({status:'unreachable',message:'The application server cannot reach Supabase. Verify the URL and that your project is running.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
