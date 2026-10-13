'use client';
import {useState} from 'react';
import '../login/login.css';
type Result={loans:number;payments:number};
export default function Import() {
  const [file,setFile]=useState<File|null>(null);const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');const [result,setResult]=useState<Result|null>(null);
  async function upload(event:React.FormEvent){
    event.preventDefault();if(!file)return;
    if(!window.confirm('Import the original historical ledger into an EMPTY workspace? This is a one-time, all-or-nothing operation.'))return;
    setBusy(true);setMessage('');
    try{
      if(file.size>700000)throw Error('Import file exceeds 700 KB.');
      const body=JSON.parse(await file.text());
      for(const k of ['borrowers','products','loans','payments','capital','outflows'])if(!Array.isArray(body[k]))throw Error('Not a Cove legacy seed JSON file: missing '+k);
      const r=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json','X-Cove-Request':'1'},body:JSON.stringify(body)});
      const data=await r.json();if(!r.ok)throw Error(data.error||'Import failed');
      setResult(data);setMessage('Import complete. Check the reconciliation dashboard before posting new transactions.');
    }catch(e){setMessage(e instanceof Error?e.message:'Upload failed')}finally{setBusy(false)}
  }
  return <main className="auth-bg"><div className="auth-card" style={{maxWidth:500}}>
      <div className="brandline">COVE<span>.</span></div><div className="overline">DATA MIGRATION</div><h1>Import original workbook</h1>
      <p>Upload <strong>Cove_Lending_Private_Import.json</strong> from the download package. The source data stays out of your public GitHub repository.</p>
      <p>The import is transactional: all loans, schedules, repayments, capital and outflows are saved together, or none are.</p>
      <form onSubmit={upload}><label>Select legacy data JSON<input type="file" accept=".json,application/json" required onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button type="submit" disabled={!file||busy}>{busy?'Importing…':'Import private lending records'} <span>→</span></button></form>
      {message&&<p className="auth-notice" role="status">{message}</p>}
      {result&&<p><strong>{result.loans} loans</strong> and <strong>{result.payments} payments</strong> imported.</p>}
      <a href="/studio" style={{display:'block',marginTop:28,color:'#176551'}}>← Return to dashboard</a>
      <small className="footer">Historical discrepancies are preserved and surfaced for review.</small>
    </div></main>;
}
