import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
export const runtime='nodejs';export const dynamic='force-dynamic';
function reply(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})}
async function owner(){
 const client=await createClient();const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Sign in required');
 const {data:member}=await client.from('workspace_members').select('workspace_id,role').eq('user_id',user.id).limit(1).maybeSingle();
 if(!member||member.role!=='owner')throw Error('Owner permission required');
 return {client,workspace:member.workspace_id as string};
}
export async function GET(){
 try{
  const s=await owner();
  const [apps,checks,events]=await Promise.all([
   s.client.from('loan_applications').select('id,applicant_name,email,phone,city_province,employment_type,income_band,monthly_debt_band,requested_amount_cents,requested_term_months,purpose,status,submitted_at,reviewed_at,review_notes').eq('workspace_id',s.workspace).order('submitted_at',{ascending:false}).limit(500),
   s.client.from('loan_application_checks').select('application_id,check_type,check_status,evidence_reference,review_note,checked_at').eq('workspace_id',s.workspace).limit(2000),
   s.client.from('loan_application_events').select('application_id,event_kind,previous_value,new_value,note,occurred_at').eq('workspace_id',s.workspace).order('occurred_at',{ascending:false}).limit(2000)
  ]);
  for(const result of [apps,checks,events])if(result.error)throw Error(result.error.message);
  return reply({applications:apps.data||[],checks:checks.data||[],events:events.data||[]});
 }catch(e){return reply({error:e instanceof Error?e.message:'Unable to read applications'},403)}
}
export async function POST(request:NextRequest){
 try{
  if(request.headers.get('x-cove-request')!=='1'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'Invalid request'},403);
  if(request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin'},403);
  if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Payload too large'},413);
  const s=await owner();const input=await request.json() as {action?:string;id?:string;values?:Record<string,unknown>};
  let data:unknown,error:{message:string}|null=null;
  if(input.action==='invite'){
   if(process.env.COVE_APPLICATION_INTAKE_ENABLED!=='true')return reply({error:'Application intake is disabled until compliance approval'},403);
   const result=await s.client.rpc('cove_create_application_invite',{w:s.workspace});data=result.data;error=result.error;
  }else if(input.action==='check'&&/^[a-f0-9-]{36}$/.test(String(input.id||''))){
   const result=await s.client.rpc('cove_v39_set_application_check',{w:s.workspace,app_id:input.id,v:input.values||{}});data=result.data;error=result.error;
  }else if(input.action==='tracking'&&/^[a-f0-9-]{36}$/.test(String(input.id||''))){
   const result=await s.client.rpc('cove_v39_issue_tracking_code',{w:s.workspace,app_id:input.id});data=result.data;error=result.error;
  }else if(input.action==='review' &&/^[a-f0-9-]{36}$/.test(String(input.id||''))){
   const result=await s.client.rpc('cove_review_application',{w:s.workspace,app_id:input.id,v:input.values||{}});data=result.data;error=result.error;
  }else return reply({error:'Invalid operation'},400);
  if(error)return reply({error:error.message},422);return reply(data,201);
 }catch(e){return reply({error:e instanceof Error?e.message:'Unable to update applications'},403)}
}
