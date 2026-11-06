'use client';
import {useEffect,useMemo,useState} from 'react';
import {buildFinancialStatements,type StatementLine,type StatementSnapshot} from '@/lib/financial-statements';
import './statements.css';

type Mode='monthly'|'quarterly'|'yearly'|'custom';
type Tab='income'|'cash_flow'|'financial_position';
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateISO=(year:number,month:number,day:number)=>new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10);
const dayBefore=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const endOf=(year:number,month:number)=>dateISO(year,month+1,0);
const money=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n).replace('PHP','₱');
const human=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
const escapeCSV=(value:unknown)=>{let s=String(value??'');if(/^[\s]*[=+@]/.test(s))s="'"+s;return `"${s.replaceAll('"','""')}"`};
function periodDates(mode:Mode,anchor:string,customStart:string,customEnd:string,today:string){
 const year=Number(anchor.slice(0,4)),month=Number(anchor.slice(5,7));
 let start='',end='';
 if(mode==='monthly'){start=dateISO(year,month,1);end=endOf(year,month)}
 else if(mode==='quarterly'){const first=1+Math.floor((month-1)/3)*3;start=dateISO(year,first,1);end=endOf(year,first+2)}
 else if(mode==='yearly'){start=dateISO(year,1,1);end=dateISO(year,12,31)}
 else {start=customStart;end=customEnd}
 if(end>today)end=today;
 return {start,end,valid:/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end&&start<=today};
}
function StatementTable({lines,title}:{lines:StatementLine[];title:string}){
 return <div className="fs-table-wrap"><table className="fs-table"><thead><tr><th>{title}</th><th>Amount (₱)</th></tr></thead><tbody>{lines.map((line,i)=><tr key={i} className={line.kind==='total'?'fs-total':line.kind==='subtotal'?'fs-subtotal':''}><td>{line.label}</td><td>{money(line.amount)}</td></tr>)}</tbody></table></div>;
}
function CSVDownload({lines,name,dateRange}:{lines:StatementLine[];name:string;dateRange:string}){
 return <button type="button" className="fs-secondary" onClick={()=>{
  const csv=[['Cove Lending Studio',name].map(escapeCSV).join(','),['Reporting period',dateRange].map(escapeCSV).join(','),
   ['Line item','Amount PHP'].map(escapeCSV).join(','),...lines.map(x=>[x.label,x.amount.toFixed(2)].map(escapeCSV).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`cove-${name.toLowerCase().replace(/\W+/g,'-')}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
 }}>Export CSV</button>;
}
export default function FinancialStatements(){
 const [mode,setMode]=useState<Mode>('monthly');
 const [anchor,setAnchor]=useState(localToday());
 const [customStart,setCustomStart]=useState(localToday().slice(0,7)+'-01');
 const [customEnd,setCustomEnd]=useState(localToday());
 const [tab,setTab]=useState<Tab>('income');
 const [data,setData]=useState<{open:StatementSnapshot;close:StatementSnapshot}|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const today=localToday();
 const range=useMemo(()=>periodDates(mode,anchor,customStart,customEnd,today),[mode,anchor,customStart,customEnd,today]);
 useEffect(()=>{
  if(!range.valid){setData(null);setError('Choose a valid reporting period ending no later than today.');return;}
  const abort=new AbortController();setBusy(true);setError('');
  const get=async(date:string):Promise<StatementSnapshot>=>{
   const r=await fetch('/api/state?as_of='+encodeURIComponent(date),{signal:abort.signal,cache:'no-store',credentials:'same-origin'});
   if(!r.ok){const body=await r.json().catch(()=>({}));throw Error(body.error||'Unable to retrieve the private financial ledger');}
   return await r.json() as StatementSnapshot;
  };
  Promise.all([get(dayBefore(range.start)),get(range.end)]).then(([open,close])=>{
   if(!abort.signal.aborted){setData({open,close});setBusy(false);}
  }).catch(e=>{if(!abort.signal.aborted){setBusy(false);setData(null);setError(e instanceof Error?e.message:'Unable to load statement');}});
  return ()=>abort.abort();
 },[range.start,range.end,range.valid]);
 const statement=useMemo(()=>data?buildFinancialStatements(data.open,data.close):null,[data]);
 const lines=statement?(tab==='income'?statement.income:tab==='cash_flow'?statement.cash_flow:statement.financial_position):[];
 const names:Record<Tab,string>={income:'Income Statement',cash_flow:'Cash Flow Statement',financial_position:'Statement of Financial Position'};
 const periodLabel=range.valid?`${human(range.start)} – ${human(range.end)}`:'Invalid date range';
 const changeYear=(y:number)=>{if(Number.isInteger(y)&&y>=2000&&y<=9999)setAnchor(dateISO(y,Number(anchor.slice(5,7)),1));};
 return <div className="fs-shell">
  <aside className="fs-side"><div className="fs-brand"><span className="fs-mark">⌁</span><span><strong>Cove<span>.</span></strong><small>LENDING STUDIO</small></span></div>
   <div className="fs-side-note"><small>PRIVATE WORKSPACE</small><b>Financial operations</b><span>Management reporting</span></div>
   <p className="fs-nav-label">MANAGE</p><a href="/studio">▦ &nbsp; Dashboard</a><a href="/studio#loans">▤ &nbsp; Loans</a><a href="/studio#collections">⇄ &nbsp; Collections</a><a href="/studio#transactions">↔ &nbsp; Cashbook</a>
   <p className="fs-nav-label">ANALYZE</p><a href="/studio/statements" className="selected">▥ &nbsp; Financial Statements</a><a href="/studio#reports">▥ &nbsp; Insights &amp; reports</a><a href="/studio/command">▧ &nbsp; V3 Operations Center</a>
   <div className="fs-side-bottom">Cove · Private, authenticated ledger</div>
  </aside>
  <main className="fs-main"><header className="fs-top"><a href="/studio">COVE</a><span>/</span><strong>Financial Statements</strong><span className="fs-private">● PRIVATE WORKSPACE</span></header>
   <div className="fs-content"><section className="fs-heading"><div><span className="fs-eyebrow">MANAGEMENT ACCOUNTING</span><h1>Financial Statements</h1><p>Period income, cash movements and portfolio position—derived from the same posted lending ledger.</p></div></section>
   <section className="fs-controls" aria-label="Financial reporting period"><div className="fs-switch" aria-label="Period selection">{(['monthly','quarterly','yearly','custom'] as Mode[]).map(m=><button type="button" key={m} aria-pressed={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{m==='monthly'?'Monthly':m==='quarterly'?'Quarterly':m==='yearly'?'Yearly':'Custom range'}</button>)}</div>
    <div className="fs-period-inputs">{mode==='monthly'?<label>Month<input aria-label="Reporting month" type="month" value={anchor.slice(0,7)} max={today.slice(0,7)} onChange={e=>setAnchor(e.target.value+'-01')}/></label>:
     mode==='quarterly'?<><label>Year<input aria-label="Reporting year" type="number" min="2000" max={Number(today.slice(0,4))} value={anchor.slice(0,4)} onChange={e=>changeYear(Number(e.target.value))}/></label><label>Quarter<select aria-label="Reporting quarter" value={Math.floor((Number(anchor.slice(5,7))-1)/3)+1} onChange={e=>setAnchor(dateISO(Number(anchor.slice(0,4)),(Number(e.target.value)-1)*3+1,1))}>{[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}</select></label></>:
     mode==='yearly'?<label>Year<input aria-label="Reporting year" type="number" min="2000" max={Number(today.slice(0,4))} value={anchor.slice(0,4)} onChange={e=>changeYear(Number(e.target.value))}/></label>:
     <><label>From<input aria-label="Start date" type="date" value={customStart} max={today} onChange={e=>setCustomStart(e.target.value)}/></label><label>To<input aria-label="End date" type="date" value={customEnd} max={today} onChange={e=>setCustomEnd(e.target.value)}/></label></>}
    </div><span className="fs-period-tag">{periodLabel}</span></section>
   <section className="fs-report-head"><div><span className="fs-eyebrow">REPORTING PACKAGE</span><h2>{names[tab]}</h2><p>{tab==='financial_position'?`As of ${human(range.end)}`:periodLabel} · PHP</p></div><div className="fs-export"><button type="button" className="fs-secondary" onClick={()=>window.print()}>Print / Save PDF</button><CSVDownload lines={lines} name={names[tab]} dateRange={periodLabel}/></div></section>
   <div className="fs-tabs" role="tablist" aria-label="Financial report"><button type="button" role="tab" aria-selected={tab==='income'} className={tab==='income'?'selected':''} onClick={()=>setTab('income')}>Income Statement</button><button type="button" role="tab" aria-selected={tab==='cash_flow'} className={tab==='cash_flow'?'selected':''} onClick={()=>setTab('cash_flow')}>Cash Flow Statement</button><button type="button" role="tab" aria-selected={tab==='financial_position'} className={tab==='financial_position'?'selected':''} onClick={()=>setTab('financial_position')}>Statement of Financial Position</button></div>
   {busy?<div className="fs-message" role="status">Loading private transaction data…</div>:error?<div className="fs-error" role="alert">{error}</div>:statement?<div className="fs-report-grid"><div className="fs-report-card"><StatementTable lines={lines} title={tab==='financial_position'?`AS OF ${human(range.end).toUpperCase()}`:`${human(range.start).toUpperCase()} – ${human(range.end).toUpperCase()}`}/></div>
   <div className="fs-aside"><div className="fs-insights"><span className="fs-eyebrow">PERIOD HIGHLIGHTS</span><div><span>Interest received</span><strong>{money(statement.metrics.interest)}</strong></div><div><span>Cash-basis operating surplus</span><strong>{money(statement.metrics.net_cash_surplus)}</strong></div><div><span>Net contributed owner capital</span><strong>{money(statement.metrics.owner_net)}</strong></div><div><span>Assets at period end</span><strong>{money(statement.metrics.assets)}</strong></div></div>
    <div className="fs-notes"><h3>Accounting basis & review notes</h3>{statement.warnings.map((note,i)=><p key={i}>• {note}</p>)}<p>Amounts are from Cove’s authenticated ledger. Exported reports should be independently reviewed before external use.</p></div></div></div>:<div className="fs-message">No report is available for the selected period.</div>}
   <footer className="fs-footer">Cove Lending Studio · Cash-basis management statements · Not audited financial statements</footer>
   </div></main>
  </div>;
}
