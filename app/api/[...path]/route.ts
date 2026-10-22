import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase';
import {buildState,type LedgerDataset} from '@/lib/ledger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={params:Promise<{path:string[]}>};
function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
function manilaDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`}
async function authContext(){
  const client=await createClient();const {data:{user},error}=await client.auth.getUser();
  if(error||!user) throw Error('401|Your session has expired. Sign in again.');
  const {data:member,error:memberError}=await client.from('workspace_members').select('workspace_id,role').eq('user_id',user.id).limit(1).maybeSingle();
  if(memberError) throw Error('500|Database permissions are not configured. Apply the Cove migration.');
  if(!member) throw Error('403|No workspace found for this account. Create a new account after applying the migration.');
  return{client,workspace:member.workspace_id,role:member.role,user};
}
async function selectAll(client:Awaited<ReturnType<typeof createClient>>,table:string,workspace:string,limit=10000){
  const rows:Record<string,unknown>[]=[];
  for(let offset=0;offset<limit;offset+=1000){
    const query=client.from(table).select('*').eq('workspace_id',workspace);
    const sorted=table==='installments'?query.order('loan_id').order('installment_no'):query.order(table==='legacy_baselines'?'workspace_id':table==='loan_voids'?'loan_id':'id');
    const {data,error}=await sorted.range(offset,offset+999);
    if(error)throw Error('500|Could not load '+table+': '+error.message);
    rows.push(...(data||[])); if(!data||data.length<1000) return rows;
  }
  throw Error('422|Portfolio exceeds current client projection capacity. Upgrade to paginated SQL reporting.');
}
async function fullDataset(ctx:Awaited<ReturnType<typeof authContext>>){
  const {client,workspace}=ctx;
  const names=['borrowers','products','loans','installments','payments','capital','outflows','audit_log','legacy_baselines','loan_voids','loan_extensions','loan_corrections','cash_accounts','cash_allocations','account_reconciliations','collection_followups','servicing_notes'] as const;
  const arrays=await Promise.all(names.map(name=>selectAll(client,name,workspace,name==='audit_log'?1000:10000)));
  const out:Record<string,Record<string,unknown>[]>={};names.forEach((key,i)=>out[key]=arrays[i]);
  return {...out,baseline:out.legacy_baselines?.[0]||null} as unknown as LedgerDataset;
}
function fail(e:unknown){const msg=e instanceof Error?e.message:'Request failed';const m=/^(401|403|422|500)\|(.*)$/.exec(msg);const code=m?Number(m[1]):400;return json({error:m?m[2]:msg},code)}

export async function GET(request:NextRequest,{params}:Params){
  try{
    const route=(await params).path.join('/');
    const ctx=await authContext();
    if(route==='health')return json({ok:true,mode:'supabase',authenticated:true});
    if(!['state','export','backup'].includes(route))return json({error:'Not found'},404);
    const raw=await fullDataset(ctx);
    const snapshot=buildState(raw,route==='state'?(request.nextUrl.searchParams.get('as_of')||manilaDate()):manilaDate());
    if(route==='state'){
      if(snapshot.as_of>manilaDate())return json({error:'Future as-of dates are not supported'},400);
      return json(snapshot);
    }
    const name=route==='backup'?`cove-ledger-snapshot-${manilaDate()}.json`:`cove-portfolio-report-${manilaDate()}.json`;
    // Snapshot includes raw records; RESTORE is NOT an automated feature, and Supabase managed backups must remain enabled separately.
    const payload=route==='backup'?{exported_at:new Date().toISOString(),format:'Cove-Cloud-ledger-raw-v1',note:'Read-only archive; not a SQL backup or automated restore',...raw}:snapshot;
    return new NextResponse(JSON.stringify(payload,null,2),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store'}});
  }catch(e){return fail(e)}
}

export async function POST(request:NextRequest,{params}:Params){
  try{
    const path=(await params).path;
    if(path.length===1&&path[0]==='signout'){
      const client=await createClient();await client.auth.signOut();
      return NextResponse.redirect(new URL('/login',request.url),303);
    }
    if(request.headers.get('x-cove-request')!=='1') return json({error:'Missing request verification header'},403);
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'JSON required'},415);
    const origin=request.headers.get('origin');if(origin&&origin!==request.nextUrl.origin)return json({error:'Invalid request origin'},403);
    const length=Number(request.headers.get('content-length')||0);
    if(length>800000)return json({error:'Request too large'},413);
    const ctx=await authContext(); if(ctx.role!=='owner')return json({error:'Owner access required'},403);
    const payload=await request.json();
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'Expected JSON object'},400);
    const pathString=path.join('/');
    if(path.length===4&&path[0]==='loans'&&path[2]==='correction'&&path[3]==='preview'){
      const {data,error}=await ctx.client.rpc('cove_plan_loan_correction',{w:ctx.workspace,lid:path[1],v:payload});
      if(error)throw Error(error.message);return json(data);
    }
    if(path.length===3&&path[0]==='loans'&&path[2]==='correct'){
      const {data,error}=await ctx.client.rpc('cove_correct_loan',{w:ctx.workspace,lid:path[1],v:payload});
      if(error)throw Error(error.message);return json(data,201);
    }
    if(path.length===3&&path[0]==='loans'&&path[2]==='void'){
      const {data,error}=await ctx.client.rpc('cove_void_test_loan',{w:ctx.workspace,v:{...payload,loan_id:path[1]}});
      if(error)throw Error(error.message);return json(data,201);
    }
    if(pathString==='import'){
      const {data,error}=await ctx.client.rpc('cove_import_legacy',{w:ctx.workspace,doc:payload});
      if(error)throw Error(error.message);return json(data,201);
    }
    let action='';let v=payload;
    if(path.length===1&&['borrowers','loans','payments','capital','outflows'].includes(path[0]))
      action=({borrowers:'borrower',loans:'loan',payments:'payment',capital:'capital',outflows:'outflow'} as Record<string,string>)[path[0]];
    if(path.length===3&&path[0]==='payments'&&path[2]==='reverse'){action='reverse';v={...payload,id:path[1]};}
    if(!action)return json({error:'Unknown operation'},404);
    const {data,error}=await ctx.client.rpc('cove_post',{w:ctx.workspace,action,v});
    if(error)throw Error(error.message);
    return json(data,201);
  }catch(e){return fail(e)}
}
