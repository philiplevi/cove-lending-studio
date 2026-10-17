import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const tables=['loan_extensions','cash_accounts','cash_allocations','account_reconciliations','collection_followups','servicing_notes'] as const;
function reply(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
async function session(){
  const client=await createClient();
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)throw new Error('401|Please sign in again');
  const {data:member,error}=await client.from('workspace_members').select('workspace_id,role').eq('user_id',user.id).limit(1).maybeSingle();
  if(error||!member)throw new Error('403|No authorized workspace found');
  return {client,workspace:member.workspace_id as string,role:member.role as string};
}
function fail(error:unknown){const message=error instanceof Error?error.message:'Unexpected error';const match=/^(401|403|422|500)\|(.*)/.exec(message);return reply({error:match?match[2]:message},match?Number(match[1]):422);}
export async function GET(request:NextRequest){
  try{
    const s=await session();const asOf=request.nextUrl.searchParams.get('as_of')||'';
    if(asOf&&!/^\d{4}-\d{2}-\d{2}$/.test(asOf))return reply({error:'Invalid as-of date'},400);
    const result:Record<string,unknown[]>={};
    for(const table of tables){
      // Bounded private reads; fail explicitly instead of silently omitting records.
      let q=s.client.from(table).select('*').eq('workspace_id',s.workspace).order('created_at',{ascending:false}).limit(5001);
      if(asOf)q=q.lte('created_at',new Date(asOf+'T23:59:59+08:00').toISOString());
      if(asOf&&(table==='loan_extensions'||table==='cash_allocations'||table==='account_reconciliations'||table==='collection_followups')){
        const col=table==='loan_extensions'?'effective_on':table==='cash_allocations'?'occurred_on':table==='account_reconciliations'?'as_of':'followup_on';
        q=q.lte(col,asOf);
      }
      const {data,error}=await q;
      if(error)throw new Error('500|Unable to read '+table+': '+error.message);
      if((data||[]).length>5000)throw new Error('422|Operation history exceeds 5,000 records. Contact your developer to add pagination.');
      result[table]=data||[];
    }
    if(request.nextUrl.searchParams.get('download')==='1')return new NextResponse(JSON.stringify({exported_at:new Date().toISOString(),format:'Cove-V3-Operations-Archive',note:'Read-only operations export; not a restorable database backup',...result},null,2),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="cove-v3-operations.json"','Cache-Control':'private, no-store'}});
    return reply(result);
  }catch(error){return fail(error);}
}
export async function POST(request:NextRequest){
  try{
    if(request.headers.get('x-cove-request')!=='1')return reply({error:'Request verification required'},403);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
    const origin=request.headers.get('origin');if(origin&&origin!==request.nextUrl.origin)return reply({error:'Cross-origin request rejected'},403);
    if(Number(request.headers.get('content-length')||0)>25000)return reply({error:'Request too large'},413);
    const s=await session();if(s.role!=='owner')return reply({error:'Owner authorization required'},403);
    const body=await request.json() as {action?:unknown;values?:unknown};
    if(!body||typeof body.action!=='string'||!body.values||typeof body.values!=='object'||Array.isArray(body.values))return reply({error:'Invalid operation'},400);
    const allowed=new Set(['create_account','assign_cash','reconcile_account','extend_loan','followup','servicing_note']);
    if(!allowed.has(body.action))return reply({error:'Operation not supported'},404);
    const {data,error}=await s.client.rpc('cove_operations',{w:s.workspace,action:body.action,v:body.values});
    if(error)throw new Error('422|'+error.message);
    return reply(data,201);
  }catch(error){return fail(error);}
}
