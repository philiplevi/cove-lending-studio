-- Cove V3.9: owner-reviewed application evidence checklist and private applicant tracking.
-- STAGING FIRST. Run after 202611070001_cove_v38_funding_applications.sql.
-- This migration changes no loan, collection, capital or cashbook rows.
create extension if not exists pgcrypto;

alter table public.loan_applications
 add column if not exists tracking_secret_hash text;

create table if not exists public.loan_application_checks (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 application_id uuid not null references public.loan_applications(id),
 check_type text not null check (check_type in ('Identity','Income','Affordability','Terms')),
 check_status text not null default 'Pending' check (check_status in ('Pending','Requested','Received','Verified','Rejected')),
 evidence_reference text not null default '',
 review_note text not null default '',
 checked_by uuid references auth.users(id),
 checked_at timestamptz,
 unique (application_id,check_type)
);
create index if not exists application_checks_workspace on public.loan_application_checks(workspace_id,application_id);

create table if not exists public.loan_application_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 application_id uuid not null references public.loan_applications(id),
 event_kind text not null check(event_kind in ('CHECK_UPDATE','STATUS_CHANGE','TRACKING_CODE_ISSUED')),
 previous_value text not null default '',
 new_value text not null default '',
 note text not null default '',
 actor_id uuid not null references auth.users(id),
 occurred_at timestamptz not null default now()
);
create index if not exists application_events_workspace on public.loan_application_events(workspace_id,application_id,occurred_at desc);

-- No direct client writes. Both tables are owner-read-only; writes go through SECURITY DEFINER functions.
do $$ declare t text;begin
 foreach t in array array['loan_application_checks','loan_application_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists cove_v39_owner_read on public.%I',t);
  execute format('create policy cove_v39_owner_read on public.%I for select to authenticated using (workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid() and m.role=''owner''))',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Replace intake RPC with wrapper. It delegates all V3.8 validation, then creates an
-- independent high-entropy status secret. Tracking secret is shown ONCE to applicant.
create or replace function public.cove_v39_submit_loan_application(token text,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;app uuid; ws uuid;secret text;
begin
 result := public.cove_submit_loan_application(token,v);
 app := (result->>'reference')::uuid;
 select workspace_id into ws from public.loan_applications where id=app;
 if ws is null then raise exception 'Application submission failed';end if;
 secret := encode(gen_random_bytes(32),'hex');
 update public.loan_applications set tracking_secret_hash=encode(digest(secret,'sha256'),'hex') where id=app;
 insert into public.loan_application_checks(workspace_id,application_id,check_type)
 select ws,app,k from unnest(array['Identity','Income','Affordability','Terms']) as k
 on conflict(application_id,check_type) do nothing;
 return result || jsonb_build_object('tracking_code',secret,'tracking_note','Save this code; it cannot be retrieved later.');
end $$;

-- No applicant name, contact, income, reviewer note, or documents are exposed to the public.
-- Reference alone never authorizes status access; secret is 256-bit random.
create or replace function public.cove_v39_track_application(reference uuid,secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
 if coalesce(secret,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid tracking details';end if;
 select status,submitted_at,reviewed_at into r
 from public.loan_applications
 where id=reference and tracking_secret_hash=encode(digest(secret,'sha256'),'hex');
 if not found then raise exception 'Invalid tracking details';end if;
 return jsonb_build_object('reference',reference,'status',r.status,'submitted_at',r.submitted_at,'updated_at',coalesce(r.reviewed_at,r.submitted_at),
 'message',case r.status
   when 'Submitted' then 'Your application is in the review queue.'
   when 'Under Review' then 'Your application is being reviewed.'
   when 'Information Required' then 'Additional information is required. Contact the lender using your established contact channel.'
   when 'Approved' then 'The request passed internal review. A separate agreement and final verification are still required; no funds have been released.'
   when 'Declined' then 'Your application was not approved.'
   when 'Withdrawn' then 'Your application is marked withdrawn.'
   else 'Contact the lender.' end);
end $$;

-- Reissue status code for pre-V3.9 submissions or where code was lost; prior code stops working.
create or replace function public.cove_v39_issue_tracking_code(w uuid,app_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare secret text;
begin
 perform public.cove_assert_owner(w);
 if not exists(select 1 from public.loan_applications where workspace_id=w and id=app_id for update)
 then raise exception 'Application not found';end if;
 secret := encode(gen_random_bytes(32),'hex');
 update public.loan_applications set tracking_secret_hash=encode(digest(secret,'sha256'),'hex') where workspace_id=w and id=app_id;
 insert into public.loan_application_events(workspace_id,application_id,event_kind,actor_id)
 values(w,app_id,'TRACKING_CODE_ISSUED',auth.uid());
 return jsonb_build_object('reference',app_id,'tracking_code',secret);
end $$;

create or replace function public.cove_v39_set_application_check(w uuid,app_id uuid,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k text:=coalesce(v->>'check_type','');s text:=coalesce(v->>'check_status','');
 note text:=trim(coalesce(v->>'note','')); evidence text:=trim(coalesce(v->>'evidence_reference',''));
 old_status text;app_status text;
begin
 perform public.cove_assert_owner(w);perform pg_advisory_xact_lock(hashtext(w::text));
 if k not in ('Identity','Income','Affordability','Terms') or s not in ('Pending','Requested','Received','Verified','Rejected') then raise exception 'Invalid check';end if;
 if length(note)<8 or length(note)>500 or length(evidence)>120 then raise exception 'Provide an 8–500 character note and brief evidence reference';end if;
 select status into app_status from public.loan_applications where workspace_id=w and id=app_id for update;
 if not found or app_status in ('Approved','Declined','Withdrawn') then raise exception 'Application is not editable';end if;
 select check_status into old_status from public.loan_application_checks where workspace_id=w and application_id=app_id and check_type=k for update;
 insert into public.loan_application_checks(workspace_id,application_id,check_type,check_status,evidence_reference,review_note,checked_by,checked_at)
 values(w,app_id,k,s,evidence,note,auth.uid(),now())
 on conflict(application_id,check_type) do update set
 check_status=excluded.check_status,evidence_reference=excluded.evidence_reference,
 review_note=excluded.review_note,checked_by=excluded.checked_by,checked_at=excluded.checked_at;
 insert into public.loan_application_events(workspace_id,application_id,event_kind,previous_value,new_value,note,actor_id)
 values(w,app_id,'CHECK_UPDATE',k||':'||coalesce(old_status,'Pending'),k||':'||s,note,auth.uid());
 return jsonb_build_object('ok',true,'check_type',k,'check_status',s);
end $$;

-- Override the existing V3.8 owner-review procedure so approval cannot bypass checklist.
-- Approvals never insert into loans or disburse cash.
create or replace function public.cove_review_application(w uuid,app_id uuid,v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare next_status text:=coalesce(v->>'status','');reason text:=trim(coalesce(v->>'note',''));
 old_status text; verified_count int;
begin
 perform public.cove_assert_owner(w);perform pg_advisory_xact_lock(hashtext(w::text));
 if next_status not in ('Under Review','Information Required','Approved','Declined','Withdrawn') then raise exception 'Invalid application status';end if;
 if length(reason)<8 or length(reason)>500 then raise exception 'Provide an 8–500 character review note';end if;
 select status into old_status from public.loan_applications where workspace_id=w and id=app_id for update;
 if not found then raise exception 'Application not found';end if;
 if old_status in ('Approved','Declined','Withdrawn') or next_status=old_status then raise exception 'Application is terminal or status unchanged';end if;
 if next_status='Approved' then
  if old_status<>'Under Review' then raise exception 'Complete Under Review before approval';end if;
  select count(distinct check_type) into verified_count from public.loan_application_checks
  where workspace_id=w and application_id=app_id and check_status='Verified';
  if verified_count<>4 then raise exception 'All four review checks must be verified before approval';end if;
 end if;
 update public.loan_applications set status=next_status,review_notes=reason,reviewed_by=auth.uid(),reviewed_at=now()
 where workspace_id=w and id=app_id;
 insert into public.loan_application_events(workspace_id,application_id,event_kind,previous_value,new_value,note,actor_id)
 values(w,app_id,'STATUS_CHANGE',old_status,next_status,reason,auth.uid());
 insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
 values(w,auth.uid(),'APPLICATION_REVIEW','loan_application',app_id::text,jsonb_build_object('from',old_status,'to',next_status,'note',reason,'creates_loan',false));
 return jsonb_build_object('ok',true,'status',next_status,'creates_loan',false);
end $$;

-- Exact grants: no direct writes, high-entropy public status check only.
revoke all on function public.cove_v39_submit_loan_application(text,jsonb) from public,authenticated;
revoke all on function public.cove_v39_track_application(uuid,text) from public,authenticated;
revoke all on function public.cove_v39_issue_tracking_code(uuid,uuid) from public,anon;
revoke all on function public.cove_v39_set_application_check(uuid,uuid,jsonb) from public,anon;
revoke all on function public.cove_submit_loan_application(text,jsonb) from public,anon,authenticated;
grant execute on function public.cove_v39_submit_loan_application(text,jsonb) to anon;
grant execute on function public.cove_v39_track_application(uuid,text) to anon;
grant execute on function public.cove_v39_issue_tracking_code(uuid,uuid) to authenticated;
grant execute on function public.cove_v39_set_application_check(uuid,uuid,jsonb) to authenticated;
-- V3.8 review RPC keeps its existing authenticated-only EXECUTE permission.
notify pgrst, 'reload schema';
