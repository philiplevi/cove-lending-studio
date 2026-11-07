'use client';
import {useState} from 'react';
import '../apply/apply.css';
type Result={reference:string;status:string;message:string;submitted_at:string;updated_at:string};
export default function Track(){
 const [reference,setReference]=useState(''),[code,setCode]=useState(''),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');setResult(null);
  try{
   const r=await fetch('/api/apply/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:reference.trim(),tracking_code:code.trim()})});
   const payload=await r.json();if(!r.ok)throw Error(payload.error||'Unable to check status');setResult(payload);
  }catch(e){setError(e instanceof Error?e.message:'Unable to check status');}finally{setBusy(false)}
 }
 return <main className="apply-shell"><div className="apply-brand">Cove<span>.</span> <small>APPLICATION TRACKING</small></div><section className="apply-card"><p className="apply-eyebrow">PRIVATE STATUS CHECK</p><h1>Track your application</h1><p>Use the application reference and your private tracking code. Do not share your tracking code.</p>
 <form onSubmit={submit}><label>Application reference<input value={reference} onChange={e=>setReference(e.target.value)} required placeholder="Application ID" autoComplete="off" maxLength={36}/></label>
 <label>Private tracking code<input value={code} onChange={e=>setCode(e.target.value)} required minLength={64} maxLength={64} type="password" placeholder="64-character code" autoComplete="off"/></label>
 <button type="submit" disabled={busy}>{busy?'Checking…':'Check application status'}</button></form>
 {error&&<p role="alert" className="apply-error">{error}</p>}
 {result&&<div className="apply-success" role="status"><p className="apply-eyebrow">CURRENT STATUS</p><h2>{result.status}</h2><p>{result.message}</p><small>Last updated: {new Date(result.updated_at).toLocaleDateString('en-PH')}</small></div>}
 <p className="apply-footer"><a href="/apply">Application information</a> · This page never collects payment or releases money.</p></section></main>;
}
