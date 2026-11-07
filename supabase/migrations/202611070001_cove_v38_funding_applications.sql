-- Cove 3.8: auditable funding classification, noncash owner settlement, invite-only application intake.
-- Back up and validate in a separate Supabase staging project first.
create extension if not exists pgcrypto;

create table if not exists public.cashbook_corrections (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 entry_kind text not null check(entry_kind in ('capital','outflow')),
 entry_id text not null, previous_values jsonb not null, corrected_values jsonb not null,
 reason text not null, corrected_by uuid not null references auth.users(id),
 corrected_at timestamptz not null default now()
);
create index if not exists cashbook_corrections_workspace on public.cashbook_corrections(workspace_id,corrected_at desc);

create table if not exists public.funding_conversions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 capital_id text not null,amount_cents bigint not null check(amount_cents>0),
 effective_on date not null, conversion_kind text not null check(conversion_kind='owner_personal_settlement'),
 evidence_reference text not null,reason text not null,recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,capital_id) references public.capital(workspace_id,id)
);
create index if not exists funding_conversions_workspace on public.funding_conversions(workspace_id,effective_on);

-- Borrower intake is structurally OFF until both the database and environment are explicitly enabled.
create table if not exists public.loan_application_settings (
 workspace_id uuid primary key references public.workspaces(id),
 enabled boolean not null default false,
 privacy_notice_version text not null default 'UNAPPROVED',
 updated_at timestamptz not null default now()
);
create table if not exists public.loan_application_invites (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 token_hash text not null unique,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),expires_at timestamptz not null,
 used_at timestamptz
);
create table if not exists public.loan_applications (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 invite_id uuid not null unique references public.loan_application_invites(id),
 applicant_name text not null,email text not null,phone text not null,city_province text not null,
 employment_type text not null,income_band text not null,
 monthly_debt_band text not null, requested_amount_cents bigint not null check(requested_amount_cents>0),
 requested_term_months integer not null check(requested_term_months between 1 and 36),purpose text not null,
 status text not null default 'Submitted' check(status in ('Submitted','Under Review','Information Required','Approved','Declined','Withdrawn')),
 privacy_notice_version text not null, applicant_declaration boolean not null check(applicant_declaration),
 submitted_at timestamptz not null default now(), reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 review_notes text not null default ''
);
create index if not exists loan_applications_workspace on public.loan_applications(workspace_id,submitted_at desc);

do $$ declare t text;begin
 foreach t in array array['cashbook_corrections','funding_conversions','loan_application_settings','loan_application_invites','loan_applications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists cove_member_read on public.%I',t);
  if t in ('loan_applications','loan_application_invites','loan_application_settings') then
   execute format('create policy cove_member_read on public.%I for select to authenticated using (workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid() and m.role=''owner''))',t);
  else
   execute format('create policy cove_member_read on public.%I for select to authenticated using (workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid()))',t);
  end if;
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Reclassifies an incorrectly coded funding receipt or outflow without modifying its cash amount/date.
-- History is explicitly restated; before/after stored in the audit journal.
create or replace function public.cove_correct_cashbook_classification(w uuid,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text:=v->>'kind'; rid text:=v->>'id'; desired text:=v->>'classification';
 reason text:=trim(coalesce(v->>'reason','')); oldrow jsonb; newrow jsonb;
 current_borrowed bigint;repaid bigint;converted bigint;
begin
 perform public.cove_assert_owner(w); perform pg_advisory_xact_lock(hashtext(w::text));
 if length(reason)<12 or length(reason)>500 then raise exception 'Provide a 12–500 character reason'; end if;
 if coalesce(v->>'confirm_id','')<>rid or length(rid)<2 then raise exception 'Confirm the exact transaction reference'; end if;
 if kind='capital' then
  if desired not in ('Personal','Loan') then raise exception 'Only Personal or Loan funding corrections supported'; end if;
  select to_jsonb(c) into oldrow from public.capital c where c.workspace_id=w and c.id=rid for update;
  if oldrow is null then raise exception 'Capital entry not found'; end if;
  if oldrow->>'source_type' not in ('Personal','Loan') or oldrow->>'source_type'=desired then raise exception 'No eligible classification change';end if;
  if desired='Personal' and exists(select 1 from public.funding_conversions f where f.workspace_id=w and f.capital_id=rid) then
   raise exception 'Funding conversion already exists; do not reclassify the original source';
  end if;
  update public.capital set source_type=desired where workspace_id=w and id=rid;
  select to_jsonb(c) into newrow from public.capital c where c.workspace_id=w and c.id=rid;
 elsif kind='outflow' then
  if desired not in ('Owner withdrawal','Operating expense','Financing cost','Capital repayment','Other cash outflow') then raise exception 'Invalid outflow classification'; end if;
  select to_jsonb(o) into oldrow from public.outflows o where o.workspace_id=w and o.id=rid for update;
  if oldrow is null or oldrow->>'classification'=desired then raise exception 'No eligible outflow classification change';end if;
  update public.outflows set classification=desired where workspace_id=w and id=rid;
  select to_jsonb(o) into newrow from public.outflows o where o.workspace_id=w and o.id=rid;
 else raise exception 'Unknown entry type'; end if;
 select coalesce(sum(amount_cents),0) into current_borrowed from public.capital where workspace_id=w and source_type='Loan';
 select coalesce(sum(amount_cents),0) into repaid from public.outflows where workspace_id=w and classification='Capital repayment';
 select coalesce(sum(amount_cents),0) into converted from public.funding_conversions where workspace_id=w;
 if current_borrowed<repaid+converted then raise exception 'Correction would make outstanding external borrowing negative; reconcile debt repayments/conversions first';end if;
 insert into public.cashbook_corrections(workspace_id,entry_kind,entry_id,previous_values,corrected_values,reason,corrected_by)
 values(w,kind,rid,oldrow,newrow,reason,auth.uid());
 insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
 values(w,auth.uid(),'CASHBOOK_CLASSIFICATION_CORRECTED',kind,rid,jsonb_build_object('before',oldrow,'after',newrow,'reason',reason));
 return jsonb_build_object('ok',true,'id',rid,'old_classification',case when kind='capital' then oldrow->>'source_type' else oldrow->>'classification' end,'new_classification',desired,'cash_change_cents',0);
end $$;

-- Records a settlement of external debt made from the owner's PERSONAL money (outside Cove's cash).
-- This is a documented noncash equity contribution + liability extinguishment, NOT a cash injection.
create or replace function public.cove_record_owner_debt_settlement(w uuid,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rid text:=v->>'capital_id'; amount bigint;effective date; reason text:=trim(coalesce(v->>'reason',''));
 evidence text:=trim(coalesce(v->>'evidence_reference','')); funding public.capital%rowtype;
 borrowed bigint; repaid bigint;converted bigint;source_converted bigint;out_id uuid;
begin
 perform public.cove_assert_owner(w);perform pg_advisory_xact_lock(hashtext(w::text));
 if coalesce(v->>'confirm_id','')<>rid or coalesce(v->>'confirm_personal_settlement','')<>'true' or coalesce(v->>'confirm_creditor_release','')<>'true' or coalesce(v->>'confirm_equity_contribution','')<>'true'
 then raise exception 'Confirm source ID, personal settlement, creditor release and equity contribution';end if;
 if length(reason)<12 or length(reason)>500 or length(evidence)<6 or length(evidence)>160 then raise exception 'Provide a reason and documentary evidence reference';end if;
 if coalesce(v->>'amount','') !~ '^\d{1,10}(\.\d{1,2})?$' then raise exception 'Invalid settlement amount';end if;
 amount:=round((v->>'amount')::numeric*100)::bigint;
 effective:=(v->>'date')::date;
 if amount<=0 or effective>(now() at time zone 'Asia/Manila')::date then raise exception 'Invalid settlement amount or date';end if;
 select * into funding from public.capital where workspace_id=w and id=rid for update;
 if not found or funding.source_type<>'Loan' or funding.occurred_on>effective then raise exception 'Select an eligible borrowed-capital entry';end if;
 select coalesce(sum(amount_cents),0) into source_converted from public.funding_conversions where workspace_id=w and capital_id=rid;
 if source_converted+amount>funding.amount_cents then raise exception 'Settlement exceeds this funding source';end if;
 select coalesce(sum(amount_cents),0) into borrowed from public.capital where workspace_id=w and source_type='Loan' and occurred_on<=effective;
 select coalesce(sum(amount_cents),0) into repaid from public.outflows where workspace_id=w and classification='Capital repayment' and occurred_on<=effective;
 select coalesce(sum(amount_cents),0) into converted from public.funding_conversions where workspace_id=w and effective_on<=effective;
 if amount>borrowed-repaid-converted then raise exception 'Settlement exceeds outstanding external funding';end if;
 insert into public.funding_conversions(workspace_id,capital_id,amount_cents,effective_on,conversion_kind,evidence_reference,reason,recorded_by)
 values(w,rid,amount,effective,'owner_personal_settlement',evidence,reason,auth.uid()) returning id into out_id;
 insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
 values(w,auth.uid(),'OWNER_DEBT_SETTLEMENT','capital',rid,jsonb_build_object('conversion_id',out_id,'amount_cents',amount,'effective_on',effective,'evidence_reference',evidence,'reason',reason,'cash_change_cents',0));
 return jsonb_build_object('ok',true,'conversion_id',out_id,'amount_cents',amount,'cash_change_cents',0);
end $$;

-- Pending public intake: one-use invitation, privacy notice and owner review.
create or replace function public.cove_create_application_invite(w uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare secret text; rowid uuid; notice text;
begin
 perform public.cove_assert_owner(w);
 select privacy_notice_version into notice from public.loan_application_settings where workspace_id=w and enabled=true;
 if notice is null or notice='UNAPPROVED' then raise exception 'Application intake is disabled or privacy notice has not been approved';end if;
 secret:=encode(gen_random_bytes(32),'hex');
 insert into public.loan_application_invites(workspace_id,token_hash,created_by,expires_at)
 values(w,encode(digest(secret,'sha256'),'hex'),auth.uid(),now()+interval '7 days') returning id into rowid;
 return jsonb_build_object('token',secret,'invite_id',rowid,'expires_in_days',7);
end $$;

create or replace function public.cove_submit_loan_application(token text,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.loan_application_invites%rowtype;setting public.loan_application_settings%rowtype;
 id_created uuid; fullname text:=trim(coalesce(v->>'full_name',''));email text:=lower(trim(coalesce(v->>'email','')));
 phone text:=trim(coalesce(v->>'phone',''));city text:=trim(coalesce(v->>'city_province',''));
 employment text:=trim(coalesce(v->>'employment_type',''));income text:=trim(coalesce(v->>'income_band',''));
 debt text:=trim(coalesce(v->>'monthly_debt_band',''));purpose text:=trim(coalesce(v->>'purpose',''));
 amount bigint;term int;
begin
 if token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid or expired application invitation';end if;
 select * into inv from public.loan_application_invites where token_hash=encode(digest(token,'sha256'),'hex') for update;
 if not found or inv.used_at is not null or inv.expires_at<=now() then raise exception 'Invalid or expired application invitation';end if;
 select * into setting from public.loan_application_settings where workspace_id=inv.workspace_id and enabled=true;
 if not found or setting.privacy_notice_version='UNAPPROVED' then raise exception 'Applications are not currently accepted';end if;
 if coalesce(v->>'notice_version','')<>setting.privacy_notice_version or coalesce(v->>'declaration','') <> 'true' or coalesce(v->>'adult_confirmed','')<>'true'
 then raise exception 'Required declaration/notice acknowledgment missing';end if;
 if length(fullname)<3 or length(fullname)>120 or length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
 or phone !~ '^\+?[0-9 -]{10,20}$' or length(city)<3 or length(city)>120
 or employment not in ('Employed','Self-employed','Student','Unemployed','Other')
 or income not in ('Below 10,000','10,000-19,999','20,000-39,999','40,000-79,999','80,000 or more','Prefer not to say')
 or debt not in ('None','Below 5,000','5,000-14,999','15,000 or more','Prefer not to say')
 or length(purpose)<5 or length(purpose)>240 then raise exception 'Application fields invalid';end if;
 if coalesce(v->>'amount','') !~ '^\d{1,9}(\.\d{1,2})?$' or coalesce(v->>'term_months','') !~ '^\d{1,2}$' then raise exception 'Invalid loan request';end if;
 amount:=round((v->>'amount')::numeric*100)::bigint; term:=(v->>'term_months')::int;
 if amount<10000 or amount>100000000 or term<1 or term>36 then raise exception 'Requested amount/term outside pilot limits';end if;
 insert into public.loan_applications(workspace_id,invite_id,applicant_name,email,phone,city_province,employment_type,income_band,monthly_debt_band,
 requested_amount_cents,requested_term_months,purpose,privacy_notice_version,applicant_declaration)
 values(inv.workspace_id,inv.id,fullname,email,phone,city,employment,income,debt,amount,term,purpose,setting.privacy_notice_version,true)
 returning id into id_created;
 update public.loan_application_invites set used_at=now() where id=inv.id;
 insert into public.audit_log(workspace_id,action,entity,entity_id,details)
 values(inv.workspace_id,'APPLICATION_SUBMITTED','loan_application',id_created::text,jsonb_build_object('status','Submitted'));
 return jsonb_build_object('ok',true,'reference',id_created);
end $$;

create or replace function public.cove_review_application(w uuid,app_id uuid,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare next_status text:=v->>'status';reason text:=trim(coalesce(v->>'note',''));old_status text;
begin
 perform public.cove_assert_owner(w);perform pg_advisory_xact_lock(hashtext(w::text));
 if next_status not in ('Under Review','Information Required','Approved','Declined','Withdrawn') then raise exception 'Invalid application status';end if;
 if length(reason)<8 or length(reason)>500 then raise exception 'Provide an 8–500 character review note';end if;
 select status into old_status from public.loan_applications where workspace_id=w and id=app_id for update;
 if not found then raise exception 'Application not found';end if;
 if old_status in ('Declined','Withdrawn') then raise exception 'Terminal application cannot be changed';end if;
 update public.loan_applications set status=next_status,review_notes=reason,reviewed_by=auth.uid(),reviewed_at=now()
 where workspace_id=w and id=app_id;
 insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
 values(w,auth.uid(),'APPLICATION_REVIEW','loan_application',app_id::text,jsonb_build_object('from',old_status,'to',next_status,'note',reason));
 return jsonb_build_object('ok',true,'status',next_status,'creates_loan',false);
end $$;

revoke all on function public.cove_correct_cashbook_classification(uuid,jsonb) from public,anon;
revoke all on function public.cove_record_owner_debt_settlement(uuid,jsonb) from public,anon;
revoke all on function public.cove_create_application_invite(uuid) from public,anon;
revoke all on function public.cove_review_application(uuid,uuid,jsonb) from public,anon;
revoke all on function public.cove_submit_loan_application(text,jsonb) from public,authenticated;
grant execute on function public.cove_correct_cashbook_classification(uuid,jsonb) to authenticated;
grant execute on function public.cove_record_owner_debt_settlement(uuid,jsonb) to authenticated;
grant execute on function public.cove_create_application_invite(uuid) to authenticated;
grant execute on function public.cove_review_application(uuid,uuid,jsonb) to authenticated;
grant execute on function public.cove_submit_loan_application(text,jsonb) to anon;
