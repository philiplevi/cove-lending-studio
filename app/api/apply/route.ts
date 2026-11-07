import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function POST(request:NextRequest){
 if(process.env.COVE_APPLICATION_INTAKE_ENABLED!=='true'||!process.env.COVE_PRIVACY_NOTICE_VERSION||process.env.COVE_PRIVACY_NOTICE_VERSION==='UNAPPROVED'||(!/^https:\/\/[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/.test(process.env.COVE_PRIVACY_NOTICE_URL||'')||(process.env.COVE_PRIVACY_NOTICE_URL||'').includes('.example')||(process.env.COVE_PRIVACY_NOTICE_URL||'').includes('your-approved')))return reply({error:'Online application intake is not yet available'},503);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Origin not allowed'},403);
 if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Application too large'},413);
 try{
  const raw=await request.text();if(raw.length>12000)return reply({error:'Application too large'},413);
  const input=JSON.parse(raw) as {token?:unknown;values?:Record<string,unknown>};
  if(typeof input?.token!=='string'||!input.values||typeof input.values!=='object'||Array.isArray(input.values))return reply({error:'Invalid application request'},400);
  if(input.values.notice_version!==process.env.COVE_PRIVACY_NOTICE_VERSION)return reply({error:'Privacy notice version mismatch'},400);
  const client=await createClient();const {data,error}=await client.rpc('cove_v39_submit_loan_application',{token:input.token,v:input.values});
  if(error)return reply({error:'Application could not be accepted. Check the invitation and required information.'},422);
  return reply(data,201);
 }catch{return reply({error:'Unable to submit application'},500)}
}
