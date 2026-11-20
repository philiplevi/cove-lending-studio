import type {SupabaseClient} from '@supabase/supabase-js';
import type {LedgerDataset} from './ledger';

async function selectAll(client:SupabaseClient,table:string,workspace:string,limit=10000){
  const rows:Record<string,unknown>[]=[];
  for(let offset=0;offset<limit;offset+=1000){
    const query=client.from(table).select('*').eq('workspace_id',workspace);
    const sorted=table==='installments'?query.order('loan_id').order('installment_no'):query.order(table==='legacy_baselines'?'workspace_id':table==='loan_voids'?'loan_id':'id');
    const {data,error}=await sorted.range(offset,offset+999);
    if(error){
      // V3.8 tables are additive. Keep existing ledger views available if deployment precedes migration.
      if(['funding_conversions','cashbook_corrections'].includes(table)&&(/PGRST205|42P01/.test(String(error.code||''))||/schema cache|does not exist/i.test(error.message)))return [];
      throw Error('500|Could not load '+table+': '+error.message);
    }
    rows.push(...(data||[])); if(!data||data.length<1000) return rows;
  }
  throw Error('422|Portfolio exceeds current client projection capacity. Upgrade to paginated SQL reporting.');
}
export async function fullDataset(ctx:{client:SupabaseClient; workspace:string}){
  const {client,workspace}=ctx;
  const names=['borrowers','products','loans','installments','payments','capital','outflows','audit_log','legacy_baselines','loan_voids','loan_extensions','loan_corrections','cash_accounts','cash_allocations','account_reconciliations','collection_followups','servicing_notes','funding_conversions','cashbook_corrections'] as const;
  const arrays=await Promise.all(names.map(name=>selectAll(client,name,workspace,name==='audit_log'?1000:10000)));
  const out:Record<string,Record<string,unknown>[]>={};names.forEach((key,i)=>out[key]=arrays[i]);
  return {...out,baseline:out.legacy_baselines?.[0]||null} as unknown as LedgerDataset;
}
