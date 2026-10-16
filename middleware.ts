import {NextRequest, NextResponse} from 'next/server';
import {createServerClient, type CookieOptions} from '@supabase/ssr';
import {supabaseSettings} from './lib/runtime-config';

export async function middleware(request: NextRequest) {
  const pathname=request.nextUrl.pathname;
  // Auth and diagnostics must remain reachable even if Supabase is down/misconfigured.
  if (pathname==='/login' || pathname==='/api/auth' || pathname==='/api/health') return NextResponse.next({request});
  let response=NextResponse.next({request});
  try {
    const {url,key}=supabaseSettings();
    const supabase=createServerClient(url,key,{
      cookies:{
        getAll(){return request.cookies.getAll();},
        setAll(toSet:{name:string;value:string;options:CookieOptions}[]){
          for(const {name,value} of toSet) request.cookies.set(name,value);
          response=NextResponse.next({request});
          for(const {name,value,options} of toSet) response.cookies.set(name,value,options);
        }
      }
    });
    const {data:{user}}=await supabase.auth.getUser();
    if(user)return response;
  } catch {
    // Keep pages private; expose diagnostics only via /api/health.
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({error:'Authentication unavailable or expired. Please sign in and check Connection Check.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const url=request.nextUrl.clone();url.pathname='/login';url.search='';
  return NextResponse.redirect(url);
}
export const config={matcher:['/studio/:path*','/import/:path*','/api/:path*']};
