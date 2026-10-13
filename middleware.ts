import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({request});
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
        toSet.forEach(({name,value}) => request.cookies.set(name,value));
        response = NextResponse.next({request});
        toSet.forEach(({name,value,options}) => response.cookies.set(name,value,options));
      }
    }}
  );
  const {data:{user}} = await supabase.auth.getUser();
  const isPublic = request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/';
  if (!user && !isPublic) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({error:'Authentication required'}, {status:401,headers:{'Cache-Control':'no-store'}});
    }
    const url=request.nextUrl.clone(); url.pathname='/login'; url.search='';
    return NextResponse.redirect(url);
  }
  if (user && request.nextUrl.pathname === '/login') {
    const url=request.nextUrl.clone();url.pathname='/studio';url.search='';return NextResponse.redirect(url);
  }
  return response;
}
export const config = { matcher: ['/studio/:path*','/import/:path*','/login','/api/:path*'] };
