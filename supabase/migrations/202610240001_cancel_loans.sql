-- Cove V3.4: audited cancellation of incorrectly entered loans.
-- Apply AFTER 202610220001_loan_corrections.sql.
-- No loans, receipts, installments, or earlier loan_voids rows are deleted.
-- Existing V2.3 test-only void workflow remains unchanged.

alter table public.loan_voids
  add column if not exists void_kind text not null default 'Test void';
alter table public.loan_voids
  add column if not exists cash_disposition text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='cove_loan_void_kind_chk') then
    alter table public.loan_voids add constraint cove_loan_void_kind_chk
      check (void_kind in ('Test void','Cancellation'));
  end if;
  if not exists (select 1 from pg_constraint where conname='cove_loan_cash_disposition_chk') then
    alter table public.loan_voids add constraint cove_loan_cash_disposition_chk
      check (cash_disposition is null or cash_disposition in ('Never disbursed','Returned in full'));
  end if;
end $$;

-- The cancellation is one transaction: validate every precondition and only then
-- insert a dated contra-release plus an audit record. Physical disbursement
-- or return of funds must be independently verified by the owner.
create or replace function public.cove_cancel_loan(w uuid, v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target public.loans%rowtype;
  today_ph date := (now() at time zone 'Asia/Manila')::date;
  reason_text text;
  disposition text;
  expected numeric;
  active_refs jsonb;
  net_total bigint;
  net_principal bigint;
  net_interest bigint;
  cash_after bigint;
begin
  perform public.cove_assert_owner(w);
  perform pg_advisory_xact_lock(hashtext(w::text));
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'Invalid cancellation request'; end if;
  reason_text := trim(coalesce(v->>'reason',''));
  if length(reason_text) not between 12 and 500 then
    raise exception 'Provide a specific cancellation reason (12–500 characters)';
  end if;
  if v->>'funds_confirmed' is distinct from 'true' then
    raise exception 'Confirm that the actual disbursement and return of funds were reconciled';
  end if;
  disposition := v->>'cash_disposition';
  if disposition is null or disposition not in ('Never disbursed','Returned in full') then
    raise exception 'Choose a verified outcome for the loan proceeds';
  end if;
  if coalesce(v->>'loan_id','')='' or v->>'confirm_loan_id' is distinct from v->>'loan_id' then
    raise exception 'Type the complete loan ID to confirm cancellation';
  end if;
  select * into target from public.loans
    where workspace_id=w and id=v->>'loan_id' for update;
  if not found then raise exception 'Loan not found'; end if;
  if target.release_date>today_ph then raise exception 'Cannot cancel a future-dated loan'; end if;
  if exists(select 1 from public.loan_voids where workspace_id=w and loan_id=target.id) then
    raise exception 'Loan is already cancelled or voided';
  end if;
  if target.source <> 'New entry' and v->>'confirm_imported' is distinct from 'true' then
    raise exception 'Imported loan: explicitly acknowledge the historical reconciliation impact';
  end if;
  if coalesce(v->>'expected_principal_cents','') !~ '^[0-9]{1,18}$' then
    raise exception 'Refresh loan details before cancelling (missing principal confirmation)';
  end if;
  expected:=(v->>'expected_principal_cents')::numeric;
  if expected <> target.principal_cents then
    raise exception 'Principal changed since preview. Refresh before cancelling';
  end if;
  if v->'expected_active_receipt_ids' is distinct from '[]'::jsonb then
    raise exception 'Cancellation requires zero active receipts. Reverse them first';
  end if;
  if exists(select 1 from public.loan_extensions
    where workspace_id=w and loan_id=target.id) then
    raise exception 'Loan has an approved extension: resolve the servicing agreement before cancellation';
  end if;
  -- Map-specific cash corrections must be reconciled independently.
  if exists(select 1 from public.cash_allocations a
     where a.workspace_id=w and ((a.source_kind='loan' and a.source_id=target.id)
       or (a.source_kind='payment' and a.source_id in
          (select p.id from public.payments p where p.workspace_id=w and p.loan_id=target.id)))) then
    raise exception 'Loan or its receipts are assigned to a cash account; unassign/reconcile them before cancelling';
  end if;
  if exists(select 1 from public.outflows o where o.workspace_id=w and
      (position(target.id in coalesce(o.description,''))>0 or
       position(target.id in coalesce(o.notes,''))>0)) then
    raise exception 'An outflow references this loan. Review and correct linked cash movements first';
  end if;
  -- Every positive receipt must have exactly one linked negative reversal; no
  -- unpaired negative postings, including imported or legacy irregularities.
  if exists (
      select 1 from public.payments p where p.workspace_id=w and p.loan_id=target.id
      and ((p.amount_cents>0 and not exists (
                select 1 from public.payments r where r.workspace_id=w
                and r.loan_id=target.id and r.reverses_id=p.id
                and r.amount_cents=-p.amount_cents
                and r.principal_cents=-p.principal_cents
                and r.interest_cents=-p.interest_cents))
           or (p.amount_cents<0 and (p.reverses_id is null or not exists (
                select 1 from public.payments original where original.workspace_id=w
                and original.id=p.reverses_id and original.loan_id=target.id
                and original.amount_cents=-p.amount_cents
                and original.principal_cents=-p.principal_cents
                and original.interest_cents=-p.interest_cents))))) then
    raise exception 'Active or irregular collection postings exist. Reverse and reconcile receipts before cancelling';
  end if;
  select coalesce(sum(amount_cents),0),coalesce(sum(principal_cents),0),coalesce(sum(interest_cents),0)
    into net_total,net_principal,net_interest from public.payments
    where workspace_id=w and loan_id=target.id;
  if net_total<>0 or net_principal<>0 or net_interest<>0 then
    raise exception 'Loan collections do not net to zero. Cannot cancel';
  end if;
  insert into public.loan_voids(workspace_id,loan_id,voided_on,principal_cents,
    reason,actor_id,reversed_receipts_count,reversed_receipts_total_cents,
    void_kind,cash_disposition)
  values(w,target.id,today_ph,target.principal_cents,reason_text,auth.uid(),0,0,
    'Cancellation',disposition);
  cash_after:=public.cove_cash(w,today_ph);
  if cash_after<0 then raise exception 'Cancellation produces a negative cash balance'; end if;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
  values(w,auth.uid(),'CANCEL','loan',target.id,
    jsonb_build_object('reason',reason_text,'cash_disposition',disposition,
      'funds_confirmed',true,'source',target.source,
      'contract_snapshot',to_jsonb(target),
      'voided_on',today_ph,'release_reversal_cents',target.principal_cents,
      'net_receipts_cents',net_total,'cash_after_cents',cash_after));
  return jsonb_build_object('ok',true,'loan_id',target.id,'status','Voided',
    'display_status','Cancelled','voided_on',today_ph,'release_reversal_cents',target.principal_cents,
    'cash_after_cents',cash_after,'source',target.source);
end $$;
revoke all on function public.cove_cancel_loan(uuid,jsonb) from public,anon;
grant execute on function public.cove_cancel_loan(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
