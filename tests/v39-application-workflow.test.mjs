import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=text('supabase/migrations/202611080001_cove_v39_application_reviews.sql');

test('status tracking is private and needs both reference and high entropy code',()=>{
 assert.match(sql,/tracking_secret_hash=encode\(digest\(secret,'sha256'\),'hex'\)/);
 assert.match(sql,/gen_random_bytes\(32\)/);
 assert.match(sql,/where id=reference and tracking_secret_hash=/);
 assert.doesNotMatch(sql,/return jsonb_build_object\('reference',reference,'status',r.status,'applicant_name'/);
 const api=text('app/api/apply/track/route.ts');
 assert.match(api,/request\.headers\.get\('origin'\)!==request\.nextUrl\.origin/);
 assert.match(api,/\.rpc\('cove_v39_track_application'/);
 assert.match(api,/Tracking details not recognized/);
 assert.match(text('app/track/page.tsx'),/type="password"/);
});

test('existing intake validation is preserved and access token never stays in URL',()=>{
 assert.match(sql,/public\.cove_submit_loan_application\(token,v\)/);
 assert.match(sql,/revoke all on function public\.cove_submit_loan_application\(text,jsonb\) from public,anon,authenticated/);
 assert.match(text('app/api/apply/route.ts'),/COVE_APPLICATION_INTAKE_ENABLED/);
 assert.match(text('app/api/apply/route.ts'),/cove_v39_submit_loan_application/);
 assert.match(text('app/apply/page.tsx'),/window\.history\.replaceState/);
});

test('decision approval is guarded by four verified checks and does not release funds',()=>{
 for(const needle of ["'Identity','Income','Affordability','Terms'",'perform public.cove_assert_owner(w)','verified_count<>4',"old_status<>'Under Review'",'creates_loan',"loan_application_events",'pg_advisory_xact_lock'])assert.ok(sql.includes(needle),needle);
 assert.doesNotMatch(sql,/insert into public\.loans\s*\(/i);
 assert.doesNotMatch(sql,/insert into public\.payments\s*\(/i);
 const admin=text('app/studio/applications/page.tsx');
 assert.match(admin,/Verification checklist/);
 assert.match(admin,/Review history/);
 assert.match(admin,/Record decision \(no disbursement\)/);
});

test('document checks record references only, not sensitive uploads',()=>{
 assert.match(sql,/create table if not exists public\.loan_application_checks/);
 assert.match(sql,/evidence_reference text/);
 assert.match(sql,/check_status in \('Pending','Requested','Received','Verified','Rejected'\)/);
 assert.doesNotMatch(text('app/studio/applications/page.tsx'),/type="file"/);
 assert.match(text('app/studio/applications/page.tsx'),/Do not enter ID numbers or upload sensitive documents/);
});

test('new operations tables have owner-scoped RLS and no direct write grants',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/m\.role=''owner''/);
 assert.match(sql,/revoke all on public\.\%I from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.\%I to authenticated/);
 assert.match(text('app/api/applications/route.ts'),/member\.role!=='owner'/);
 assert.match(text('app/api/applications/route.ts'),/cove_v39_set_application_check/);
});
