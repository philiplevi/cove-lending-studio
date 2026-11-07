'use client';
import {useEffect,useState} from 'react';
import './apply.css';

const PILOT_MESSAGE='Applications are currently invitation-only. A submission is not a loan offer, approval, or disbursement.';
export default function Apply(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[reference,setReference]=useState('');
 const [token,setToken]=useState('');
 const [enabled,setEnabled]=useState(false),[noticeVersion,setNoticeVersion]=useState('UNAPPROVED'),[noticeUrl,setNoticeUrl]=useState('');
 // The owner must activate intake after verifying the applicable lending and privacy requirements.
 // This client page does not read public build-time flags; readiness comes from the server.
 useEffect(()=>{const url=new URL(window.location.href);setToken(url.searchParams.get('invite')||'');window.history.replaceState(null,'','/apply');
  fetch('/api/apply/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{setEnabled(d.enabled===true);setNoticeVersion(d.notice_version||'UNAPPROVED');setNoticeUrl(d.notice_url||'');}).catch(()=>{});
 },[]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setMessage('');
  if(!enabled){setMessage('Applications are not currently accepted.');return;}
  const form=e.currentTarget;const values=Object.fromEntries(new FormData(form));
  setBusy(true);
  try{
   const response=await fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,values})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to submit application');
   setReference(result.reference);form.reset();window.history.replaceState(null,'','/apply');
  }catch(err){setMessage(err instanceof Error?err.message:'Unable to submit application');}
  finally{setBusy(false);}
 }
 return <main className="apply-shell"><div className="apply-brand">Cove<span>.</span> <small>LOAN APPLICATIONS</small></div><section className="apply-card"><p className="apply-eyebrow">PRIVATE INVITATION · INITIAL REQUEST</p><h1>Apply for a loan</h1><p>{PILOT_MESSAGE}</p>
 {!enabled?<div className="apply-closed"><strong>Applications are not open yet.</strong><p>The lending and privacy setup must be approved before we collect applicant information online.</p></div>:reference?<div role="status" className="apply-success"><h2>Application received</h2><p>Your reference is <strong>{reference}</strong>.</p><p>Save this reference. Approval is subject to independent review and a separate agreement.</p></div>:<form onSubmit={submit}>
 <label>Full legal name<input required minLength={3} maxLength={120} name="full_name" autoComplete="name"/></label>
 <div className="apply-grid"><label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><label>Mobile number<input name="phone" type="tel" required minLength={10} maxLength={20} autoComplete="tel"/></label></div>
 <label>City / province<input name="city_province" required minLength={3} maxLength={120} autoComplete="address-level2"/></label>
 <div className="apply-grid"><label>Employment<select name="employment_type" required><option value="">Select</option>{['Employed','Self-employed','Student','Unemployed','Other'].map(x=><option key={x}>{x}</option>)}</select></label><label>Monthly income range<select name="income_band" required><option value="">Select</option>{['Below 10,000','10,000-19,999','20,000-39,999','40,000-79,999','80,000 or more','Prefer not to say'].map(x=><option key={x}>{x}</option>)}</select></label></div>
 <label>Existing monthly debt payments<select name="monthly_debt_band" required><option value="">Select</option>{['None','Below 5,000','5,000-14,999','15,000 or more','Prefer not to say'].map(x=><option key={x}>{x}</option>)}</select></label>
 <div className="apply-grid"><label>Amount requested (PHP)<input name="amount" type="number" min="100" max="1000000" step="0.01" required/></label><label>Term in months<input name="term_months" type="number" min="1" max="36" required/></label></div>
 <label>Loan purpose<textarea name="purpose" minLength={5} maxLength={240} required rows={3}/></label>
 <div className="apply-consent"><p><strong>Privacy notice:</strong> <a href={noticeUrl} target="_blank" rel="noopener noreferrer">Read the approved borrower privacy notice</a>. Your application is evaluated manually, and no loan is created by this request.</p></div>
 <label className="apply-check"><input type="checkbox" name="adult_confirmed" value="true" required/> I confirm that I am at least 18 years old.</label>
 <label className="apply-check"><input type="checkbox" name="declaration" value="true" required/> I confirm the information is accurate and acknowledge the applicable privacy notice.</label>
 <input type="hidden" name="notice_version" value={noticeVersion}/>
 <button disabled={busy} type="submit">{busy?'Submitting…':'Submit application for review'}</button>
 {message&&<p className="apply-error" role="alert">{message}</p>}</form>}
 </section><footer className="apply-footer">Cove Lending Studio · No automatic approval or disbursement</footer></main>;
}
