'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {borrowerStatement,cashAccountCoverage,collectionForecast,financialPerformance,payoffQuote} from '@/lib/management';
import './command.css';
type Row=Record<string,any>;
type State={as_of:string;summary:Row;borrowers:Row[];loans:Row[];payments:Row[];capital:Row[];outflows:Row[];activity:Row[];schedule_items:Row[];audit_log:Row[]};
type Ops={cash_accounts:Row[];cash_allocations:Row[];account_reconciliations:Row[];collection_followups:Row[];loan_extensions:Row[];servicing_notes:Row[]};
const EMPTY:Ops={cash_accounts:[],cash_allocations:[],account_reconciliations:[],collection_followups:[],loan_extensions:[],servicing_notes:[]};
const php=(v:unknown)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(v||0)).replace('PHP','₱');
const date=(d:unknown)=>{const s=String(d||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?new Date(s.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'—';};
const day=()=>{const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Manila'}).formatToParts(new Date());const x=(k:string)=>parts.find(p=>p.type===k)?.value||'';return `${x('year')}-${x('month')}-${x('day')}`;};
const tabs=[['overview','Overview'],['servicing','Loan servicing'],['statements','Borrower statements'],['accounts','Cash reconciliation'],['collections','Follow-ups'],['audit','Audit & security']] as const;
function Stat({name,value,help}:{name:string;value:string;help?:string}){return <div className="cc-stat"><span>{name}</span><strong>{value}</strong>{help&&<small>{help}</small>}</div>;}
function Empty({children}:{children:React.ReactNode}){return <div className="cc-empty">{children}</div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="cc-field"><span>{label}</span>{children}</label>;}
export default function OperationsCommand(){
 const [asOf,setAsOf]=useState(day());const [tab,setTab]=useState('overview');const [state,setState]=useState<State|null>(null);const [ops,setOps]=useState<Ops>(EMPTY);
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const [loanId,setLoanId]=useState('');const [borrowerId,setBorrowerId]=useState('');const [scenario,setScenario]=useState(85);
 const [accountId,setAccountId]=useState('');const [txId,setTxId]=useState('');
 const [accountName,setAccountName]=useState('');const [accountKind,setAccountKind]=useState('Cash');
 const [balance,setBalance]=useState('');const [reason,setReason]=useState('');const [newMaturity,setNewMaturity]=useState('');
 const [followChannel,setFollowChannel]=useState('Call');const [followOutcome,setFollowOutcome]=useState('Contacted');const [promiseDate,setPromiseDate]=useState('');
 const [requestType,setRequestType]=useState('Restructure request');const [notes,setNotes]=useState('');
 async function refresh(){setLoading(true);setError('');try{
   const [s,o]=await Promise.all([fetch('/api/state?as_of='+encodeURIComponent(asOf),{cache:'no-store'}),fetch('/api/operations?as_of='+encodeURIComponent(asOf),{cache:'no-store'})]);
   const sj=await s.json();const oj=await o.json();if(!s.ok)throw Error(sj.error||'Ledger unavailable');if(!o.ok)throw Error(oj.error||'Operations unavailable. Apply the V3.0 SQL migration first.');
   setState(sj);setOps(oj);
   setLoanId(prev=>sj.loans.some((l:Row)=>l.id===prev)?prev:sj.loans.find((l:Row)=>l.status!=='Voided')?.id||'');
   setBorrowerId(prev=>sj.borrowers.some((b:Row)=>b.id===prev)?prev:sj.borrowers[0]?.id||'');
   setAccountId(prev=>oj.cash_accounts.some((a:Row)=>a.id===prev)?prev:oj.cash_accounts[0]?.id||'');
 }catch(e){setError(e instanceof Error?e.message:'Unable to load');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[asOf]);
 async function action(name:string,values:Record<string,unknown>){setBusy(true);setError('');setNotice('');try{
   const r=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json','X-Cove-Request':'1'},body:JSON.stringify({action:name,values})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Save failed');setNotice(`Saved ${name.replaceAll('_',' ')} successfully. Audit reference: ${j.id}`);setNotes('');setReason('');await refresh();
 }catch(e){setError(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}}
 const performance=useMemo(()=>state?financialPerformance(state):null,[state]);
 const forecast=useMemo(()=>state?collectionForecast(state,6,scenario/100):null,[state,scenario]);
 const coverage=useMemo(()=>state?cashAccountCoverage(state,ops):null,[state,ops]);
 const borrower=useMemo(()=>{if(!state||!borrowerId)return null;try{return borrowerStatement(state,borrowerId)}catch{return null;}},[state,borrowerId]);
 const quote=useMemo(()=>{if(!state||!loanId)return null;try{return payoffQuote(state,loanId)}catch{return null;}},[state,loanId]);
 const selectedLoan=state?.loans.find(l=>l.id===loanId);const selectedAccount=coverage?.accounts.find(a=>a.id===accountId);
 const noFuture=asOf===day();const canWrite=noFuture&&!busy;
 const allTransactions=coverage?.unassigned||[];
 const chosenTx=allTransactions.find((x:Row)=>`${x.kind}:${x.id}`===txId);
 const totals=state?.summary;
 const selectLoans=<select value={loanId} onChange={e=>{setLoanId(e.target.value);setNewMaturity('');}}>{state?.loans.map(l=><option key={l.id} value={l.id}>{l.id} — {l.borrower_name} · {php(l.gross_outstanding)} ({l.status})</option>)}</select>;
 const history=(ops.loan_extensions||[]).filter(x=>x.loan_id===loanId);
 const maturity=selectedLoan?.schedule?.at(-1)?.due_date||'';
 return <div className="cc-shell">
   <header className="cc-top"><div><a href="/studio" className="cc-back">← Cove dashboard</a><span className="cc-brand">COVE / OPERATIONS COMMAND</span><h1>Cove Lending 3.0</h1><p>Loan servicing · statements · liquidity controls · risk intelligence</p></div><div className="cc-actions"><Field label="Portfolio as of"><input type="date" value={asOf} max={day()} onChange={e=>setAsOf(e.target.value)}/></Field><button onClick={()=>void refresh()} disabled={loading}>Refresh</button></div></header>
   <nav className="cc-tabs" aria-label="Operations pages">{tabs.map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
   {error&&<div className="cc-alert cc-danger" role="alert">{error}</div>}{notice&&<div className="cc-alert cc-good" role="status">{notice}</div>}
   {loading?<div className="cc-panel"><p>Loading secure portfolio and operations records…</p></div>:state&&<>
   {tab==='overview'&&<div className="cc-layout">
     <div className="cc-grid four"><Stat name="Portfolio assets" value={php(totals?.portfolio_assets)} help="Cash + outstanding principal"/><Stat name="Monthly contractual interest" value={php(totals?.monthly_interest_run_rate)} help="Active loans · not realized income"/><Stat name="Contractual final due" value={date(totals?.scheduled_final_collection_date)} help="Latest active loan installment"/><Stat name="Collection exposure" value={php(totals?.gross_outstanding)} help="Principal + contracted interest remaining"/></div>
     <section className="cc-panel"><div className="cc-heading"><div><h2>Cash-basis performance</h2><p>Separates the return on lending from withdrawals and capital movements.</p></div></div>
       <div className="cc-grid three"><Stat name="Interest received (net of reversals)" value={php(performance?.interest_collected)}/><Stat name="Operating + financing costs classified" value={php((performance?.operating_costs||0)+(performance?.financing_costs||0))}/><Stat name="Illustrative cash-basis margin" value={php(performance?.cash_basis_margin)} help="Not formal accounting net profit"/></div>
       <div className="cc-note">{performance?.status} {performance?.unclassified_outflows?`Unclassified outflows: ${php(performance.unclassified_outflows)}—review classifications before using profit figures.`:'Expense classifications may need independent review.'}</div>
     </section>
     <section className="cc-panel"><div className="cc-heading"><div><h2>6-month collection scenarios</h2><p>Forward-looking schedule, not a prediction of borrower behavior.</p></div><label className="cc-range">Collection scenario <strong>{scenario}%</strong><input type="range" min="50" max="100" step="5" value={scenario} onChange={e=>setScenario(Number(e.target.value))}/></label></div>
       <div className="cc-forecast">{forecast?.months.map(row=><div className="cc-forecast-row" key={row.month}><span>{row.month}</span><div className="cc-meter"><div style={{width:`${Math.min(100,row.scheduled_due?row.scenario_collections/Math.max(1,row.scheduled_due)*100:0)}%`}}/></div><strong>{php(row.scenario_collections)}</strong><small>Scheduled {php(row.scheduled_due)}</small></div>)}</div>
       <div className="cc-note">{forecast?.warning} Negative or zero cash at baseline is preserved; the tool does not simulate new disbursements.</div>
     </section>
     <section className="cc-panel"><h2>Controls requiring attention</h2><div className="cc-grid three"><Stat name="Unassigned account movements" value={String(coverage?.unassigned_count||0)} help="Cash account tagging, not missing ledger entries"/><Stat name="Account mapping difference" value={php(coverage?.unmapped_cash_difference)} help="Total cash less mapped accounts"/><Stat name="Recorded follow-ups" value={String(ops.collection_followups?.length||0)}/></div></section>
   </div>}
   {tab==='servicing'&&<div className="cc-layout two"><section className="cc-panel"><h2>Contractual payoff quote</h2><p>For early settlement, record the resulting real payment in the existing Collections screen. Do not invent a waiver.</p><Field label="Loan">{selectLoans}</Field>{quote&&<div className="cc-grid two"><Stat name="Remaining principal" value={php(quote.principal)}/><Stat name="Uncollected contractual interest" value={php(quote.contractual_interest_remaining)}/><Stat name="Full payoff amount" value={php(quote.full_contractual_payoff)}/><Stat name="Maturity" value={date(maturity)}/></div>}
    <div className="cc-note">{quote?.note}</div><a className="cc-link" href="/studio">Open Collections to record a payment →</a></section>
    <section className="cc-panel"><h2>Controlled due-date extension</h2><p>Changes the projected future due dates only. Original installments, interest, and principal are retained in history. Existing overdue loans require review.</p>
      <form onSubmit={e=>{e.preventDefault();if(!selectedLoan||!confirm(`Extend ${selectedLoan.id} to ${newMaturity}? This cannot be deleted from the audit trail.`))return;void action('extend_loan',{loan_id:loanId,new_maturity:newMaturity,expected_maturity:maturity,reason});}}>
        <Field label="New final due date"><input required type="date" value={newMaturity} min={maturity} onChange={e=>setNewMaturity(e.target.value)} disabled={!canWrite}/></Field>
        <Field label="Reason (10–500 characters)"><textarea minLength={10} maxLength={500} required value={reason} onChange={e=>setReason(e.target.value)} disabled={!canWrite} placeholder="Document the agreement, authorization, and revised collection expectation"/></Field>
        <button className="cc-primary" disabled={!canWrite||!quote?.eligible}>Record extension</button></form>
      <h3>Extension history</h3>{history.length?<table><thead><tr><th>Effective</th><th>Old due</th><th>New due</th></tr></thead><tbody>{history.map((h:Row)=><tr key={h.id}><td>{date(h.effective_on)}</td><td>{date(h.previous_maturity)}</td><td>{date(h.new_maturity)}</td></tr>)}</tbody></table>:<Empty>No extensions for this loan.</Empty>}
    </section>
    <section className="cc-panel cc-span"><h2>Other servicing requests (review only)</h2><p>Renewals, fee waivers, and restructures are documented here but do NOT automatically change the loan agreement or ledger. Further product rules require your approval.</p>
      <form className="cc-inline" onSubmit={e=>{e.preventDefault();void action('servicing_note',{loan_id:loanId,request_type:requestType,notes});}}><Field label="Request type"><select value={requestType} onChange={e=>setRequestType(e.target.value)}><option>Renewal inquiry</option><option>Interest waiver request</option><option>Restructure request</option><option>Other</option></select></Field><Field label="Request details"><input required minLength={10} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="At least 10 characters"/></Field><button disabled={!canWrite}>Record for review</button></form>
      <div className="cc-compact">{ops.servicing_notes.filter(n=>n.loan_id===loanId).slice(0,10).map(n=><p key={n.id}><strong>{n.request_type}</strong> — {n.status} · {n.notes}</p>)}</div>
    </section>
   </div>}
   {tab==='statements'&&<div className="cc-layout"><section className="cc-panel cc-print-area"><div className="cc-heading"><div><h2>Borrower statement</h2><p>Reconstructs the borrower’s loans and net payments as of the selected date.</p></div><button className="cc-no-print" onClick={()=>window.print()} disabled={!borrower}>Print / Save as PDF</button></div>
     <Field label="Borrower"><select value={borrowerId} onChange={e=>setBorrowerId(e.target.value)}>{state.borrowers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
     {borrower?<><div className="cc-print-title"><h2>{borrower.borrower.name}</h2><p>Statement as of {date(borrower.as_of)} · Cove Lending Studio</p></div>
      <div className="cc-grid three"><Stat name="Principal outstanding" value={php(borrower.principal_outstanding)}/><Stat name="Contractual receivable" value={php(borrower.contractual_balance)}/><Stat name="Net amount collected" value={php(borrower.receipts_net)}/></div>
      <h3>Loan accounts</h3><div className="cc-table-wrap"><table><thead><tr><th>Loan</th><th>Released</th><th>Original principal</th><th>Contractual due</th><th>Balance</th><th>Status</th></tr></thead><tbody>{borrower.loans.map(l=><tr key={l.id}><td>{l.id}</td><td>{date(l.release_date)}</td><td>{php(l.principal)}</td><td>{php(l.payable)}</td><td>{php(l.gross_outstanding)}</td><td>{l.status}</td></tr>)}</tbody></table></div>
      <h3>Receipts and reversals</h3><div className="cc-table-wrap"><table><thead><tr><th>Reference</th><th>Paid on</th><th>Loan</th><th>Amount</th><th>Principal</th><th>Interest</th></tr></thead><tbody>{borrower.payments.map(p=><tr key={p.id}><td>{p.id}{p.reverses_id?' · reversal':''}</td><td>{date(p.paid_on)}</td><td>{p.loan_id}</td><td>{php(p.amount)}</td><td>{php(p.principal)}</td><td>{php(p.interest)}</td></tr>)}</tbody></table></div>
      <div className="cc-note">Historical source allocations remain unchanged. This is a ledger statement, not a legal payoff certificate; voided releases are displayed for traceability.</div></>:<Empty>Select a borrower to produce a statement.</Empty>}
    </section></div>}
   {tab==='accounts'&&<div className="cc-layout two"><section className="cc-panel"><h2>Cash, bank & e-wallet accounts</h2><p>Tag existing cashbook transactions to accounts—never recreate the cash movement. Unassigned legacy transactions remain visible.</p>
     <form className="cc-inline" onSubmit={e=>{e.preventDefault();void action('create_account',{name:accountName,kind:accountKind});setAccountName('');}}><Field label="Account name"><input required minLength={2} maxLength={80} value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="e.g. Bank 1"/></Field><Field label="Type"><select value={accountKind} onChange={e=>setAccountKind(e.target.value)}><option>Cash</option><option>Bank</option><option>E-wallet</option></select></Field><button disabled={!canWrite}>Add account</button></form>
     <div className="cc-account-list">{coverage?.accounts.map(a=><button className={accountId===a.id?'selected':''} key={a.id} onClick={()=>setAccountId(a.id)}><span><strong>{a.name}</strong><small>{a.kind}</small></span><b>{php(a.mapped_balance)}</b></button>)}</div>
    </section>
    <section className="cc-panel"><h2>Map existing transactions</h2><p>Unassigned items: <strong>{coverage?.unassigned_count}</strong>. Each source transaction may belong to only one account.</p>{!coverage?.accounts.length?<Empty>Create a cash account first.</Empty>:<form onSubmit={e=>{e.preventDefault();if(!chosenTx)return;void action('assign_cash',{account_id:accountId,source_kind:chosenTx.kind,source_id:chosenTx.id});setTxId('');}}>
      <Field label="Destination account"><select value={accountId} onChange={e=>setAccountId(e.target.value)}>{coverage?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Unassigned movement"><select required value={txId} onChange={e=>setTxId(e.target.value)}><option value="">Select a transaction</option>{allTransactions.map((t:Row)=><option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>{t.date} · {t.kind} {t.id} · {php(t.amount)}</option>)}</select></Field>
      <button className="cc-primary" disabled={!canWrite||!chosenTx}>Assign transaction</button></form>}
      <div className="cc-note">Assignments are informational classifications. They do not affect total fund cash, and do not represent bank statements or verified transfer transactions.</div></section>
    <section className="cc-panel cc-span"><h2>Reconcile an external balance</h2><p>Enter the verified balance of the selected account. The difference is recorded, not automatically adjusted.</p>
      {selectedAccount?<><div className="cc-grid three"><Stat name="Selected account" value={selectedAccount.name}/><Stat name="Mapped transaction balance" value={php(selectedAccount.mapped_balance)}/><Stat name="Unmapped fund cash" value={php(coverage?.unmapped_cash_difference)} help="Must be reviewed before full reconciliation"/></div>
      <form className="cc-inline" onSubmit={e=>{e.preventDefault();void action('reconcile_account',{account_id:accountId,as_of:asOf,observed_balance:balance,notes});setBalance('');}}><Field label="Verified statement/cash-count balance (₱)"><input required pattern="-?[0-9]+(\.[0-9]{1,2})?" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0.00"/></Field><Field label="Source / reconciliation notes"><input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Bank statement date, reconciliation remarks"/></Field><button disabled={!canWrite}>Save reconciliation</button></form>
      <div className="cc-compact">{ops.account_reconciliations.filter(r=>r.account_id===accountId).slice(0,7).map(r=><p key={r.id}><strong>{date(r.as_of)}:</strong> Statement {php(r.observed_balance_cents/100)} · Mapped {php(r.mapped_balance_cents/100)} · Difference {php(r.difference_cents/100)}</p>)}</div></>:<Empty>No account selected.</Empty>}
    </section></div>}
   {tab==='collections'&&<div className="cc-layout two"><section className="cc-panel"><h2>Collection follow-up</h2><p>Record outreach history, promises to pay, and missed contact attempts. No messages are sent by Cove.</p>
    <form onSubmit={e=>{e.preventDefault();void action('followup',{loan_id:loanId,date:asOf,channel:followChannel,outcome:followOutcome,promise_date:promiseDate,notes});setPromiseDate('');}}>
     <Field label="Loan">{selectLoans}</Field><div className="cc-grid two"><Field label="Channel"><select value={followChannel} onChange={e=>setFollowChannel(e.target.value)}>{['Call','SMS draft','Email draft','In person','Other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Outcome"><select value={followOutcome} onChange={e=>setFollowOutcome(e.target.value)}>{['Planned','Contacted','Promise to pay','No response','Completed'].map(x=><option key={x}>{x}</option>)}</select></Field></div>
     <Field label="Promise-to-pay date (if any)"><input type="date" value={promiseDate} onChange={e=>setPromiseDate(e.target.value)}/></Field><Field label="Notes"><textarea value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)} placeholder="Outcome, next steps, agreed amount…"/></Field><button className="cc-primary" disabled={!canWrite}>Record follow-up</button></form></section>
     <section className="cc-panel"><h2>Ready-to-copy reminder draft</h2><p>Review the details before sharing; send using your own authorized communication channel.</p><div className="cc-draft">Hello, this is a friendly reminder about your Cove loan {selectedLoan?.id||'—'}. Our records show a remaining contracted balance of {php(selectedLoan?.gross_outstanding)} as of {date(asOf)}. Please contact us if you need to discuss your upcoming payment. Thank you.</div>
      <button onClick={()=>void navigator.clipboard.writeText(`Hello, this is a friendly reminder about your loan ${selectedLoan?.id||''}. Our records show a remaining contracted balance of ${php(selectedLoan?.gross_outstanding)} as of ${date(asOf)}. Please contact us to discuss your upcoming payment. Thank you.`).then(()=>setNotice('Reminder copied. Cove did not send a message.')).catch(()=>setError('Clipboard unavailable. Copy the draft manually.'))}>Copy reminder text</button><div className="cc-note">No SMS, email, or payment requests are automatically sent. Obtain appropriate consent and review borrower communication preferences before sharing.</div></section>
      <section className="cc-panel cc-span"><h2>Follow-up history</h2><div className="cc-table-wrap"><table><thead><tr><th>Date</th><th>Loan</th><th>Channel</th><th>Outcome</th><th>Promise</th><th>Notes</th></tr></thead><tbody>{ops.collection_followups.map(r=><tr key={r.id}><td>{date(r.followup_on)}</td><td>{r.loan_id}</td><td>{r.channel}</td><td>{r.outcome}</td><td>{date(r.promise_date)}</td><td>{r.notes}</td></tr>)}</tbody></table></div></section>
    </div>}
   {tab==='audit'&&<div className="cc-layout"><section className="cc-panel"><h2>Security, exports & control overview</h2><div className="cc-grid three"><Stat name="Recorded ledger audit actions" value={String(state.audit_log.length)}/><Stat name="Operations servicing notes" value={String(ops.servicing_notes.length)}/><Stat name="Bank/cash reconciliation records" value={String(ops.account_reconciliations.length)}/></div>
     <div className="cc-buttons"><a className="cc-link cc-button" href="/api/backup">Download ledger snapshot (JSON)</a><a className="cc-link cc-button" href="/api/operations?download=1">Review operations JSON</a></div><div className="cc-note">Snapshot exports are NOT a full restorable Supabase database backup. Maintain private managed backups and test restoration separately. Keep exports out of GitHub. MFA and account-provider settings are managed in Supabase, not silently enabled here.</div></section>
    <section className="cc-panel"><h2>Recent ledger audit history</h2><div className="cc-table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Entity</th><th>Reference</th></tr></thead><tbody>{state.audit_log.slice(0,100).map((r:Row,i:number)=><tr key={r.id||i}><td>{String(r.occurred_at).slice(0,19)}</td><td>{r.action}</td><td>{r.entity}</td><td>{r.entity_id}</td></tr>)}</tbody></table></div></section>
   </div>}
   <footer className="cc-footer">Cove Lending Studio V3.0 · Secure owner workspace · Figures are estimates until validated against original records and external account statements.</footer>
   </>}
 </div>;
}
