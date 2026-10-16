-- Cove Lending Studio V2.3: audited, atomic cancellation of TEST-ONLY loans.
-- Apply after 202610090001_cove.sql. Do NOT rerun the original schema migration.
-- No original loan or payment is deleted or overwritten.

create table if not exists public.loan_voids (
  workspace_id uuid not null,
  loan_id text not null,
  voided_on date not null,
  principal_cents bigint not null check(principal_cents > 0),
  reason text not null check(length(trim(reason)) >= 10),
  actor_id uuid references auth.users(id),
  reversed_receipts_count integer not null default 0,
  reversed_receipts_total_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key(workspace_id,loan_id),
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id)
);
create index if not exists loan_voids_workspace_date on public.loan_voids(workspace_id,voided_on);
alter table public.loan_voids enable row level security;
drop policy if exists workspace_read on public.loan_voids;
create policy workspace_read on public.loan_voids for select to authenticated using (
  workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid())
);
revoke all on public.loan_voids from anon,authenticated;
grant select on public.loan_voids to authenticated;

-- The original release remains in the ledger, while this dated contra-entry restores
-- the release cash effect. Past as-of balances remain unchanged before void date.
create or replace function public.cove_cash(w uuid, cutoff date)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
select (select coalesce(sum(amount_cents),0) from public.capital where workspace_id=w and occurred_on<=cutoff)
 - (select coalesce(sum(principal_cents),0) from public.loans where workspace_id=w and release_date<=cutoff)
 + (select coalesce(sum(amount_cents),0) from public.payments where workspace_id=w and paid_on<=cutoff)
 - (select coalesce(sum(amount_cents),0) from public.outflows where workspace_id=w and occurred_on<=cutoff)
 + (select coalesce(sum(principal_cents),0) from public.loan_voids where workspace_id=w and voided_on<=cutoff);
$$;

-- Guard against a late payment being added to a voided loan from any insertion path,
-- including the existing cove_post function (which runs with definer privileges).
create or replace function public.cove_guard_voided_loan_payment()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists (select 1 from public.loan_voids
             where workspace_id=new.workspace_id and loan_id=new.loan_id)
     then raise exception 'This loan is voided and cannot accept more payments';
  end if;
  return new;
end $$;
drop trigger if exists cove_guard_voided_loan_payment on public.payments;
create trigger cove_guard_voided_loan_payment
before insert on public.payments for each row execute function public.cove_guard_voided_loan_payment();

-- One request = one DB transaction: reverse all still-active receipts, then void
-- the original release, with one audit trail. Any error rolls back EVERYTHING.
create or replace function public.cove_void_test_loan(w uuid, v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target public.loans%rowtype;
  receipt public.payments%rowtype;
  rid text;
  reason_text text;
  today_ph date := (now() at time zone 'Asia/Manila')::date;
  actual_receipts jsonb;
  expected_receipts jsonb;
  receipt_count integer := 0;
  receipt_total bigint := 0;
  cash_after bigint;
begin
  perform public.cove_assert_owner(w);
  perform pg_advisory_xact_lock(hashtext(w::text));
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'Invalid void request'; end if;
  reason_text := trim(coalesce(v->>'reason',''));
  if length(reason_text) < 10 or length(reason_text) > 500 then
    raise exception 'Provide a void reason of 10 to 500 characters';
  end if;
  if v->>'test_only' is distinct from 'true' then
    raise exception 'Confirm that this loan and all receipts were test-only with no unsettled real cash movements';
  end if;
  if v->>'loan_id' is null or v->>'confirm_loan_id' is distinct from v->>'loan_id' then
    raise exception 'Loan ID confirmation did not match';
  end if;
  select * into target from public.loans where workspace_id=w and id=v->>'loan_id' for update;
  if not found then raise exception 'Loan not found'; end if;
  if target.source <> 'New entry' then
    raise exception 'Imported or historical loans cannot be voided by the test-loan workflow';
  end if;
  if exists(select 1 from public.loan_voids where workspace_id=w and loan_id=target.id) then
    raise exception 'Loan is already voided';
  end if;
  if (v->>'expected_principal_cents')::bigint is distinct from target.principal_cents then
    raise exception 'Loan amount has changed; refresh and inspect before voiding';
  end if;
  -- Imported payments and unpaired/manual debit entries require investigation.
  if exists(select 1 from public.payments p where p.workspace_id=w and p.loan_id=target.id
            and (p.source not in ('New entry','Reversal')
              or (p.amount_cents < 0 and (p.reverses_id is null or not exists(
                   select 1 from public.payments original where original.workspace_id=w
                   and original.id=p.reverses_id and original.loan_id=target.id
                   and original.amount_cents=-p.amount_cents
                   and original.principal_cents=-p.principal_cents
                   and original.interest_cents=-p.interest_cents))))
           ) then raise exception 'Loan contains imported or irregular payments; manual review required';
  end if;
  select coalesce(jsonb_agg(p.id order by p.id),'[]'::jsonb)
    into actual_receipts from public.payments p
    where p.workspace_id=w and p.loan_id=target.id and p.amount_cents>0
      and not exists(select 1 from public.payments r where r.workspace_id=w and r.reverses_id=p.id);
  expected_receipts := v->'expected_active_receipt_ids';
  if jsonb_typeof(expected_receipts) is distinct from 'array' or expected_receipts <> actual_receipts then
    raise exception 'Payments changed since preview. Refresh the loan before voiding';
  end if;
  -- Reverse receipts in ascending source-ID order, posting on the current PH date.
  for receipt in select p.* from public.payments p
    where p.workspace_id=w and p.loan_id=target.id and p.amount_cents>0
      and not exists(select 1 from public.payments r where r.workspace_id=w and r.reverses_id=p.id)
    order by p.id
  loop
    rid:=public.cove_next_id(w,'payments','R',6);
    insert into public.payments(workspace_id,id,loan_id,paid_on,amount_cents,principal_cents,interest_cents,
      method,notes,reverses_id,source_ref,source,created_by)
    values(w,rid,target.id,today_ph,-receipt.amount_cents,-receipt.principal_cents,-receipt.interest_cents,
      receipt.method,'VOID TEST LOAN: '||reason_text,receipt.id,rid,'Reversal',auth.uid());
    insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
    values(w,auth.uid(),'REVERSE','payment',rid,jsonb_build_object('original_receipt',receipt.id,
      'loan_id',target.id,'amount_cents',-receipt.amount_cents,'reason',reason_text));
    receipt_count:=receipt_count+1;
    receipt_total:=receipt_total+receipt.amount_cents;
  end loop;
  insert into public.loan_voids(workspace_id,loan_id,voided_on,principal_cents,reason,actor_id,
    reversed_receipts_count,reversed_receipts_total_cents)
  values(w,target.id,today_ph,target.principal_cents,reason_text,auth.uid(),receipt_count,receipt_total);
  cash_after:=public.cove_cash(w,today_ph);
  if cash_after < 0 then raise exception 'Resulting fund cash would be negative; investigate before voiding'; end if;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
  values(w,auth.uid(),'VOID','loan',target.id,jsonb_build_object(
    'reason',reason_text,'effective_on',today_ph,'principal_reversed_cents',target.principal_cents,
    'receipts_reversed',receipt_count,'receipts_reversed_cents',receipt_total,
    'cash_after_cents',cash_after,'test_only_confirmed',true));
  return jsonb_build_object('ok',true,'loan_id',target.id,'status','Voided',
    'voided_on',today_ph,'reversed_receipts_count',receipt_count,
    'reversed_receipts_total_cents',receipt_total,'release_reversal_cents',target.principal_cents,
    'cash_after_cents',cash_after);
end $$;

revoke all on function public.cove_void_test_loan(uuid,jsonb) from public,anon;
grant execute on function public.cove_void_test_loan(uuid,jsonb) to authenticated;
revoke all on function public.cove_guard_voided_loan_payment() from public,anon,authenticated;
