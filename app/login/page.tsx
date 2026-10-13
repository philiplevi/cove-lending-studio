'use client';
import {useState} from 'react';
import {browserClient} from '@/lib/browser';
import './login.css';
export default function Login() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const [register,setRegister]=useState(false);
  async function submit(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const client=browserClient();
      const result=register?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      if(register&&!result.data.session) setMessage('Check your email for your verification link, then sign in.');
      else {window.location.assign('/studio');return;}
    } catch(e) {setMessage(e instanceof Error?e.message:'Could not sign in');}
    finally {setBusy(false)}
  }
  return <main className="auth-bg"><div className="auth-card"><span className="auth-icon">⌁</span><div className="brandline">COVE<span>.</span></div><div className="overline">PRIVATE LENDING WORKSPACE</div><h1>{register?'Create your workspace':'Welcome back'}</h1><p>Manage your portfolio with clarity, precision and control.</p>
      <form onSubmit={submit}><label>Email address<input autoComplete="email" type="email" value={email} required onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input autoComplete={register?'new-password':'current-password'} minLength={8} type="password" value={password} required onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={busy} type="submit">{busy?'Please wait…':register?'Create secure account':'Sign in to Cove'} <span>→</span></button></form>
      {message&&<p className="auth-notice" role="status">{message}</p>}
      <button type="button" className="switch" onClick={()=>{setRegister(!register);setMessage('')}}>{register?'Already have an account? Sign in':'First time? Create your workspace'}</button>
      <small className="footer">Private by design · Encrypted connection · Row-level data isolation</small>
    </div></main>;
}
