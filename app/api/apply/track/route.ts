import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
export const dynamic='force-dynamic';export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function POST(request:NextRequest){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Origin not allowed'},403);
 if(Number(request.headers.get('content-length')||0)>1000)return reply({error:'Request too large'},413);
 try{
  const raw=await request.text();if(raw.length>1000)return reply({error:'Request too large'},413);
  const data=JSON.parse(raw) as {reference?:unknown;tracking_code?:unknown};
  const reference=typeof data.reference==='string'?data.reference.trim():'';
  const code=typeof data.tracking_code==='string'?data.tracking_code.trim():'';
  if(!/^[a-f0-9-]{36}$/.test(reference)||!/^[a-f0-9]{64}$/.test(code))return reply({error:'Invalid tracking details'},400);
  const client=await createClient();
  const result=await client.rpc('cove_v39_track_application',{reference,secret:code});
  if(result.error)return reply({error:'Tracking details not recognized'},404);
  return reply(result.data);
 }catch{return reply({error:'Unable to check application'},400)}
}
