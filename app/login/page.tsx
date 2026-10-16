'use client';
import {useState} from 'react';
import './login.css';

type Reply={ok?:boolean;needsVerification?:boolean;message?:string;error?:string};
export default function Login() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [register,setRegister]=useState(false);
  const [diagnosing,setDiagnosing]=useState(false);

  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/auth',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:register?'signup':'signin',email,password})
      });
      const data:Reply=await response.json();
      if(!response.ok) throw new Error(data.error || `Authentication failed (HTTP ${response.status}).`);
      if(data.needsVerification) {setMessage(data.message||'Check your email to verify your account.');return;}
      window.location.assign('/studio');
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {setBusy(false);}
  }

  async function checkConnection() {
    setDiagnosing(true);setMessage('Checking server connection to Supabase…');
    try {
      const response=await fetch('/api/health',{cache:'no-store'});
      const data:{message?:string} = await response.json();
      setMessage(data.message || (response.ok?'Supabase connection looks healthy.':'Connection check failed.'));
    } catch {setMessage('Could not contact the Cove application server. Check the deployed URL and your internet connection.');}
    finally {setDiagnosing(false);}
  }

  return <main className="auth-bg"><div className="auth-card"><span className="auth-icon">⌁</span><div className="brandline">COVE<span>.</span></div><div className="overline">PRIVATE LENDING WORKSPACE</div><h1>{register?'Create your workspace':'Welcome back'}</h1><p>Manage your portfolio with clarity, precision and control.</p>
    <form onSubmit={submit}>
      <label>Email address<input autoComplete="email" type="email" value={email} required maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input autoComplete={register?'new-password':'current-password'} minLength={8} maxLength={128} type="password" value={password} required onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={busy} type="submit">{busy?'Please wait…':register?'Create secure account':'Sign in to Cove'} <span>→</span></button>
    </form>
    {message&&<p className="auth-notice" role="status" aria-live="polite">{message}</p>}
    <button type="button" className="switch" onClick={()=>{setRegister(!register);setMessage('');}}>{register?'Already have an account? Sign in':'First time? Create your workspace'}</button>
    <button type="button" className="switch" disabled={diagnosing} onClick={checkConnection}>{diagnosing?'Checking connection…':'Check Supabase connection'}</button>
    <small className="footer">Private by design · HTTPS transport · Database row-level access controls</small>
  </div></main>;
}
