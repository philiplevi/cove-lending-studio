import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:NextRequest){
 try{
  if(request.headers.get('x-cove-request')!=='1'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'Invalid request'},403);
  if(request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin'},403);
  if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Payload too large'},413);
  const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)return reply({error:'Sign in required'},401);
  const {data:member}=await client.from('workspace_members').select('workspace_id,role').eq('user_id',user.id).limit(1).maybeSingle();
  if(!member||member.role!=='owner')return reply({error:'Owner permission required'},403);
  const input=await request.json() as {action?:unknown;values?:Record<string,unknown>};
  if(!input||typeof input.values!=='object'||!input.values||Array.isArray(input.values))return reply({error:'Invalid payload'},400);
  const action=input.action==='classify'?'cove_correct_cashbook_classification':input.action==='settle'?'cove_record_owner_debt_settlement':null;
  if(!action)return reply({error:'Unknown funding action'},404);
  const {data,error}=await client.rpc(action,{w:member.workspace_id,v:input.values});
  if(error)return reply({error:error.message},422);
  return reply(data,201);
 }catch{return reply({error:'Unable to process funding correction'},500)}
}
