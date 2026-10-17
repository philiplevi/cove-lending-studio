/* Pure presentation-side projection. Database RPC is the authoritative financial write engine.
 * Monetary inputs are centavos; never mutate the source arrays. */
type Row = Record<string, any>;
export type LedgerDataset = {borrowers:Row[];products:Row[];loans:Row[];installments:Row[];payments:Row[];capital:Row[];outflows:Row[];audit_log:Row[];loan_voids?:Row[];loan_extensions?:Row[];baseline?:Row|null;};
const val=(r:Row,key:string)=>Number(r[key]||0);
const pesos=(c:number)=>Math.round(c)/100;
const rounded=(n:number)=>Math.round(n*100)/100;
const daysBetween=(oldest:string,day:string)=>Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(oldest+'T12:00:00Z'))/86400000);
const dateOnly=(s:unknown)=>String(s||'').slice(0,10);
const shiftedDate=(iso:string,days:number)=>new Date(Date.parse(iso+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export function buildState(input:LedgerDataset,asOf:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(asOf))) throw Error('Invalid as-of date');
  const borrowers=input.borrowers||[];
  const products: Row[] = (input.products||[]).map(p=>({...p,monthly_rate:Number(p.monthly_rate),max_per_loan:pesos(val(p,'max_per_loan_cents'))}));
  const prById=new Map(products.map(p=>[p.id,p]));const byId=new Map(borrowers.map(b=>[b.id,b]));
  const loans=(input.loans||[]).filter(l=>dateOnly(l.release_date)<=asOf);
  const voids=(input.loan_voids||[]).filter(v=>dateOnly(v.voided_on)<=asOf);
  const voidByLoan=new Map(voids.map(v=>[v.loan_id,v]));
  const extensions=(input.loan_extensions||[]).filter(x=>dateOnly(x.effective_on)<=asOf)
    .sort((a,b)=>String(a.effective_on).localeCompare(String(b.effective_on))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  const extByLoan=new Map<string,Row[]>();
  for(const extension of extensions){const list=extByLoan.get(extension.loan_id)||[];list.push(extension);extByLoan.set(extension.loan_id,list);}
  const payments=(input.payments||[]).filter(p=>dateOnly(p.paid_on)<=asOf).sort((a,b)=>String(b.paid_on).localeCompare(String(a.paid_on))||String(b.id).localeCompare(String(a.id)));
  const capital=(input.capital||[]).filter(x=>dateOnly(x.occurred_on)<=asOf);
  const outflows=(input.outflows||[]).filter(x=>dateOnly(x.occurred_on)<=asOf);
  const scheduleMap=new Map<string,Row[]>();
  for(const i of input.installments||[]) {
    if(!scheduleMap.has(i.loan_id))scheduleMap.set(i.loan_id,[]);
    scheduleMap.get(i.loan_id)!.push(i);
  }
  const paidByLoan=new Map<string,{amount:number,principal:number,interest:number}>();
  for(const p of payments){const x=paidByLoan.get(p.loan_id)||{amount:0,principal:0,interest:0};x.amount+=val(p,'amount_cents');x.principal+=val(p,'principal_cents');x.interest+=val(p,'interest_cents');paidByLoan.set(p.loan_id,x)}
  let overdue=0; const upcoming:Row[]=[];const scheduleItems:Row[]=[];const exceptions:string[]=[];
  const enriched: Row[] = loans.map<Row>(l=>{
    const paid=paidByLoan.get(l.id)||{amount:0,principal:0,interest:0};
    const voidRecord=voidByLoan.get(l.id);
    const voided=Boolean(voidRecord);
    const outstanding=val(l,'principal_cents')-paid.principal;
    const gross=val(l,'payable_cents')-paid.amount;
    const remainingInterest=val(l,'interest_cents')-paid.interest;
    // As-of-effective maturity shifts; original installments remain unchanged in PostgreSQL.
    // No interest/principal is recalculated by an extension.
    const list: Row[]=(scheduleMap.get(l.id)||[]).map(i=>({...i,due_date:dateOnly(i.due_date)}));
    list.sort((a,b)=>Number(a.installment_no)-Number(b.installment_no));
    for(const extension of extByLoan.get(l.id)||[]){
      const delta=daysBetween(dateOnly(extension.previous_maturity),dateOnly(extension.new_maturity));
      for(const i of list)if(dateOnly(i.due_date)>=dateOnly(extension.effective_on))i.due_date=shiftedDate(dateOnly(i.due_date),delta);
    }
    const scheduled=list.map(i=>({number:i.installment_no,due_date:dateOnly(i.due_date),amount:pesos(val(i,'amount_cents'))}));
    // Apply net posted receipts to installments, oldest first. This is a schedule
    // projection, NOT a replacement for the authoritative receipt allocations.
    if(!voided&&gross>0){
      let available=Math.max(0,paid.amount);
      for(const i of list){
        const amount=val(i,'amount_cents');
        const applied=Math.min(amount,available);
        available-=applied;
        const due=dateOnly(i.due_date);
        if(amount>applied) scheduleItems.push({loan_id:l.id,borrower:byId.get(l.borrower_id)?.name||'Unknown',installment_no:i.installment_no,
          due_date:due,scheduled:pesos(amount),paid:pesos(applied),amount:pesos(amount-applied),
          status:due<asOf?'Overdue':due===asOf?'Due today':'Upcoming',
          days_past_due:due<asOf?daysBetween(due,asOf):0});
      }
    }
    const dueToDate=list.filter(i=>dateOnly(i.due_date)<asOf).reduce((acc,i)=>acc+val(i,'amount_cents'),0);
    const overdueCents=voided?0:Math.max(0,dueToDate-paid.amount);overdue+=overdueCents;
    let balanceToAllocate=paid.amount;let oldest:string|undefined;
    if(!voided)for(const i of list){const due=dateOnly(i.due_date), dueAmount=val(i,'amount_cents');
      if(balanceToAllocate>=dueAmount){balanceToAllocate-=dueAmount;continue;}
      if(due<asOf){if(!oldest)oldest=due;continue;}
      if(gross>0){upcoming.push({loan_id:l.id,borrower:byId.get(l.borrower_id)?.name||'Unknown',due_date:due,amount:pesos(Math.max(0,dueAmount-Math.max(0,balanceToAllocate)))});break;}
    }
    const product=prById.get(l.product_id);const status=voided?'Voided':gross<=0?'Settled':(overdueCents>0?'Overdue':'Active');
    if(!voided&&(outstanding<0||gross<0||remainingInterest<0))exceptions.push(`${l.id}: negative balance detected; review payment allocation`);
    if(product?.max_per_loan_cents&&val(l,'principal_cents')>val(product,'max_per_loan_cents'))exceptions.push(`${l.id}: principal exceeds configured ${product.name} limit`);
    return {...l,borrower_name:byId.get(l.borrower_id)?.name||'Unknown',product_name:product?.name||'Unclassified',
      principal:pesos(val(l,'principal_cents')),interest:pesos(val(l,'interest_cents')),payable:pesos(val(l,'payable_cents')),
      paid:pesos(paid.amount),paid_principal:pesos(paid.principal),paid_interest:pesos(paid.interest),
      principal_outstanding:voided?0:pesos(Math.max(0,outstanding)),gross_outstanding:voided?0:pesos(Math.max(0,gross)),
      remaining_interest:voided?0:pesos(Math.max(0,remainingInterest)),voided_on:voidRecord?dateOnly(voidRecord.voided_on):null,void_reason:voidRecord?.reason??null,overdue:pesos(overdueCents),days_past_due:oldest?daysBetween(oldest,asOf):0,
      monthly_rate:Number(l.monthly_rate),status,schedule:scheduled,extensions:extByLoan.get(l.id)||[]};
  }).sort((a,b)=>String(b.release_date).localeCompare(String(a.release_date))||String(b.id).localeCompare(String(a.id)));
  const activeContracts=enriched.filter(l=>l.status!=='Settled'&&l.status!=='Voided');
  // Contractual maturity is a scheduled date, not a promise that cash will arrive.
  const scheduledFinalCollectionDate=activeContracts.reduce<string|null>((latest,l)=>{
    const dates=l.schedule.map((i:Row)=>i.due_date).filter((d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d));
    const end=dates.length?dates.reduce((max:string,d:string)=>d>max?d:max):null;
    return end&&(!latest||end>latest)?end:latest;
  },null);
  scheduleItems.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.loan_id.localeCompare(b.loan_id)||a.installment_no-b.installment_no);
  const sum=(rows:Row[],column:string)=>rows.reduce((a,r)=>a+val(r,column),0);
  const cap=sum(capital,'amount_cents'),disb=sum(loans,'principal_cents'),col=sum(payments,'amount_cents'),outs=sum(outflows,'amount_cents'),voidReversals=sum(voids,'principal_cents');
  const cash=cap-disb+col-outs+voidReversals, principalOutstanding=rounded(enriched.reduce((a,l)=>a+l.principal_outstanding,0));
  const grossOutstanding=rounded(enriched.reduce((a,l)=>a+l.gross_outstanding,0));
  const interestCollected=sum(payments,'interest_cents'),financingCost=sum(outflows.filter(o=>o.classification==='Financing cost'),'amount_cents');
  const summary={cash:pesos(cash),principal_outstanding:principalOutstanding,gross_outstanding:grossOutstanding,
    portfolio_assets:rounded(pesos(cash)+principalOutstanding),capital:pesos(cap),releases:pesos(disb),release_reversals:pesos(voidReversals),net_releases:pesos(disb-voidReversals),collections:pesos(col),outflows:pesos(outs),
    principal_collected:pesos(sum(payments,'principal_cents')),interest_collected:pesos(interestCollected),financing_cost:pesos(financingCost),
    net_interest_cash:pesos(interestCollected-financingCost),
    // Flat-rate approved monthly contract amount for active loans, not actual
    // interest accrued or money earned and received this calendar month.
    monthly_interest_run_rate:pesos(activeContracts.reduce((a,l)=>a+Math.round(val(l,'principal_cents')*Number(l.monthly_rate)),0)),
    scheduled_final_collection_date:scheduledFinalCollectionDate,
    last_due_is_past:Boolean(scheduledFinalCollectionDate&&scheduledFinalCollectionDate<asOf),
    monthly_funding_interest:pesos(sum(capital.filter(c=>c.source_type==='Loan'&&!['cancelled','closed','repaid'].includes(String(c.status).toLowerCase())),'funding_interest_cents')),
    active_original_principal:rounded(enriched.filter(l=>l.status!=='Settled'&&l.status!=='Voided').reduce((a,l)=>a+l.principal,0)),
    overdue_amount:pesos(overdue),overdue_loans:enriched.filter(l=>l.status==='Overdue').length,
    active_loans:enriched.filter(l=>l.status!=='Settled'&&l.status!=='Voided').length,settled_loans:enriched.filter(l=>l.status==='Settled').length,voided_loans:enriched.filter(l=>l.status==='Voided').length,
    capital_deployed_pct:pesos(cash)+principalOutstanding>0?rounded(principalOutstanding/(pesos(cash)+principalOutstanding)*100):0,
    available_capital:rounded(pesos(cash)+principalOutstanding),
    collection_rate:loans.filter(l=>!voidByLoan.has(l.id)).length?rounded(col/sum(loans.filter(l=>!voidByLoan.has(l.id)),'payable_cents')*100):0};
  // Age only unpaid installments that are actually past their contractual due date.
  const aging=[{label:'1–30 days',min:1,max:30},{label:'31–60 days',min:31,max:60},{label:'61–90 days',min:61,max:90},{label:'90+ days',min:91,max:Infinity}]
    .map(b=>({label:b.label,amount:rounded(scheduleItems.filter(i=>i.status==='Overdue'&&i.days_past_due>=b.min&&i.days_past_due<=b.max).reduce((a,i)=>a+i.amount,0)),
      installments:scheduleItems.filter(i=>i.status==='Overdue'&&i.days_past_due>=b.min&&i.days_past_due<=b.max).length}));
  const dueByDate=(status:string)=>scheduleItems.filter(i=>i.status===status).reduce((a,i)=>a+Math.round(i.amount*100),0);
  const cumulativeScheduledDue=loans.filter(l=>!voidByLoan.has(l.id)).reduce((acc,l)=>acc+(scheduleMap.get(l.id)||[])
    .filter(i=>dateOnly(i.due_date)<=asOf).reduce((sum,i)=>sum+val(i,'amount_cents'),0),0);
  // This is a contractual collection coverage proxy. Early receipts are allocated
  // to the oldest due installment, while unpaid future dues stay excluded.
  const cumulativeCoverage=loans.filter(l=>!voidByLoan.has(l.id)).reduce((acc,l)=>{
    const due=(scheduleMap.get(l.id)||[]).filter(i=>dateOnly(i.due_date)<=asOf).reduce((sum,i)=>sum+val(i,'amount_cents'),0);
    return acc+Math.min(due,Math.max(0,paidByLoan.get(l.id)?.amount||0));
  },0);
  const collectionIntelligence={due_today:pesos(dueByDate('Due today')),past_due:pesos(dueByDate('Overdue')),
    due_next_7_days:rounded(scheduleItems.filter(i=>i.due_date>asOf&&daysBetween(asOf,i.due_date)<=7).reduce((a,i)=>a+i.amount,0)),
    due_next_30_days:rounded(scheduleItems.filter(i=>i.due_date>asOf&&daysBetween(asOf,i.due_date)<=30).reduce((a,i)=>a+i.amount,0)),
    due_to_date:pesos(cumulativeScheduledDue),covered_due_to_date:pesos(cumulativeCoverage),
    collection_coverage_pct:cumulativeScheduledDue?rounded(cumulativeCoverage/cumulativeScheduledDue*100):null,
    open_installments:scheduleItems.length,aging};
  const concentration=borrowers.map(b=>{
    const own=enriched.filter(l=>l.borrower_id===b.id),amount=rounded(own.reduce((a,l)=>a+l.principal_outstanding,0));
    return{id:b.id,name:b.name,amount,share:principalOutstanding?Math.round(amount/principalOutstanding*1000)/10:0,active_loans:own.filter(l=>l.status!=='Settled'&&l.status!=='Voided').length,lifetime_loans:own.length};
  }).sort((a,b)=>b.amount-a.amount);
  const months=new Map<string,Row>();
  for(const [key,records,dateKey,centsKey] of [
    ['capital',capital,'occurred_on','amount_cents'],['releases',loans,'release_date','principal_cents'],
    ['collections',payments,'paid_on','amount_cents'],['outflows',outflows,'occurred_on','amount_cents'],['release_reversals',voids,'voided_on','principal_cents']
  ] as [string,Row[],string,string][]) {
    for(const r of records){const month=dateOnly(r[dateKey]).slice(0,7),item=months.get(month)||{month,capital:0,releases:0,collections:0,outflows:0,release_reversals:0};item[key]+=val(r,centsKey);months.set(month,item);}
  }
  let running=0;
  const monthly=[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>{
    running+=m.capital-m.releases+m.release_reversals+m.collections-m.outflows;
    return{month:m.month,capital:pesos(m.capital),releases:pesos(m.releases),release_reversals:pesos(m.release_reversals),collections:pesos(m.collections),outflows:pesos(m.outflows),cash:pesos(running)};
  });
  const activity:Row[]=[];
  for(const p of payments)activity.push({id:p.id,date:dateOnly(p.paid_on),title:`Payment · ${byId.get(loans.find(l=>l.id===p.loan_id)?.borrower_id)?.name||'Unknown'}`,subtitle:`${p.loan_id} · ${p.method}`,kind:'Collection',amount:pesos(val(p,'amount_cents')),loan_id:p.loan_id});
  for(const l of enriched)activity.push({id:l.id,date:dateOnly(l.release_date),title:`Loan release · ${l.borrower_name}`,subtitle:l.product_name,kind:'Release',amount:-l.principal,loan_id:l.id});
  for(const v of voids)activity.push({id:'VOID-'+v.loan_id,date:dateOnly(v.voided_on),title:`Void test loan · ${byId.get(loans.find(l=>l.id===v.loan_id)?.borrower_id)?.name||'Unknown'}`,subtitle:`${v.loan_id} · release reversal`,kind:'Loan void',amount:pesos(val(v,'principal_cents')),loan_id:v.loan_id});
  for(const c of capital)activity.push({id:c.id,date:dateOnly(c.occurred_on),title:'Capital infusion',subtitle:c.source_type,kind:'Capital',amount:pesos(val(c,'amount_cents'))});
  for(const o of outflows)activity.push({id:o.id,date:dateOnly(o.occurred_on),title:o.description||o.classification,subtitle:o.classification,kind:'Outflow',amount:-pesos(val(o,'amount_cents'))});
  activity.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
  const original=input.baseline?.baseline||{};
  const reconItems:[string,string,number][]=[['Capital infusion','capital',summary.capital],['Net loan releases','releases',summary.net_releases],
    ['Collections','collections',summary.collections],['Cash outflows','outflows',summary.outflows],['Cash balance','cash',summary.cash],
    ['Outstanding principal · masterlist','principal_master',summary.principal_outstanding],['Outstanding principal · monthly summary','principal_monthly',summary.principal_outstanding],
    ['Interest collected · receipt ledger','interest_collected',summary.interest_collected],['Interest collected · dashboard','interest_dashboard',summary.interest_collected],
    ['Assets · monthly summary','assets_monthly',summary.portfolio_assets]];
  const reconciliation=reconItems.filter(([,key])=>Object.hasOwn(original,key)).map(([name,key,system])=>({name,book:Number(original[key]),system,variance:rounded(system-Number(original[key]))}));
  const refs=new Map<string,string>();
  for(const p of payments){if(p.source_ref&&refs.has(p.source_ref))exceptions.push(`${p.id}: duplicate imported source receipt ${p.source_ref}`);if(p.source_ref)refs.set(p.source_ref,p.id);}
  return {as_of:asOf,summary,borrowers,products,loans:enriched,loan_voids:voids,loan_extensions:extensions,
    payments:payments.map(p=>({...p,borrower_name:byId.get(loans.find(l=>l.id===p.loan_id)?.borrower_id)?.name||'Unknown',amount:pesos(val(p,'amount_cents')),principal:pesos(val(p,'principal_cents')),interest:pesos(val(p,'interest_cents'))})),
    capital:capital.map(c=>({...c,amount:pesos(val(c,'amount_cents'))})),outflows:outflows.map(o=>({...o,amount:pesos(val(o,'amount_cents'))})),
    monthly,concentration,collection_intelligence:collectionIntelligence,schedule_items:scheduleItems,
    upcoming:upcoming.sort((a,b)=>a.due_date.localeCompare(b.due_date)),activity,reconciliation,exceptions,
    audit_log:(input.audit_log||[]).map(a=>({...a,actor:a.actor_id?'Owner':'System',occurred_at:a.occurred_at||new Date().toISOString()})),
    data_source:input.baseline?.source_name||'Live workspace'};
}
