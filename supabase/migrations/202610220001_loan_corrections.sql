-- Cove V3.3: audited correction of an incorrectly encoded loan agreement.
-- Run AFTER the V3.0 operations migration. Test in a staging Supabase project first.
-- Corrections are RESTATEMENTS from original release, not new loans or cash transactions.
-- Original loan terms, schedules and receipt allocations are snapshotted in loan_corrections.
-- Existing receipt AMOUNTS, references, dates, loan IDs and reversal links are immutable.

create table if not exists public.loan_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  loan_id text not null,
  corrected_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  reason text not null check(length(trim(reason)) between 10 and 500),
  old_loan jsonb not null, new_loan jsonb not null,
  old_schedule jsonb not null, new_schedule jsonb not null,
  receipt_reallocations jsonb not null default '[]'::jsonb,
  expected_revision text not null,
  foreign key(workspace_id,loan_id) references public.loans(workspace_id,id)
);
create index if not exists cove_loan_corrections_history on public.loan_corrections(workspace_id,loan_id,corrected_at desc);
alter table public.loan_corrections enable row level security;
drop policy if exists cove_corrections_read on public.loan_corrections;
create policy cove_corrections_read on public.loan_corrections for select to authenticated using (
 workspace_id in (select m.workspace_id from public.workspace_members m where m.user_id=auth.uid()));
revoke all on public.loan_corrections from public, anon, authenticated;
grant select on public.loan_corrections to authenticated;

-- One server-side calculation is used for both preview and commit. This avoids
-- browser/SQL rounding discrepancies. Must not modify records on preview.
create or replace function public.cove_plan_loan_correction(w uuid, lid text, v jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  old_l public.loans%rowtype;
  prod public.products%rowtype;
  new_pi bigint; new_it bigint; new_total bigint;
  new_term integer; n integer; j integer;
  new_date date; due date; first_due date; today_ph date := (now() at time zone 'Asia/Manila')::date;
  new_rate numeric(12,8); new_borrower text; new_product text; new_frequency text;
  r public.payments%rowtype;
  pi_part bigint; it_part bigint; remainder bigint;
  used_pi bigint := 0; used_it bigint := 0; total_paid bigint := 0; count_active integer := 0;
  old_schedule jsonb; fresh_schedule jsonb := '[]'::jsonb; reallocations jsonb := '[]'::jsonb;
  old_agreement jsonb; new_agreement jsonb; checksum text; reason text;
  planned_map jsonb := '{}'::jsonb; prior_split jsonb;
begin
  perform public.cove_assert_owner(w);
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'Correction must be a JSON object'; end if;
  select * into old_l from public.loans where workspace_id=w and id=lid;
  if not found then raise exception 'Loan not found'; end if;
  if exists(select 1 from public.loan_voids where workspace_id=w and loan_id=lid) then
    raise exception 'A voided loan cannot be edited'; end if;
  if exists(select 1 from public.loan_extensions where workspace_id=w and loan_id=lid) then
    raise exception 'Loan has an approved extension: review and reverse/resolve its servicing agreement before correcting original terms'; end if;
  reason := trim(coalesce(v->>'reason',''));
  if length(reason) not between 10 and 500 then raise exception 'Explain why the original entry was incorrect (10–500 characters)'; end if;
  new_borrower := coalesce(nullif(trim(v->>'borrower_id'),''),old_l.borrower_id);
  new_product := coalesce(nullif(trim(v->>'product_id'),''),old_l.product_id);
  if not exists(select 1 from public.borrowers where workspace_id=w and id=new_borrower) then raise exception 'Choose an existing borrower'; end if;
  select * into prod from public.products where workspace_id=w and id=new_product;
  if not found then raise exception 'Choose an existing loan product'; end if;
  if coalesce(v->>'principal','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'Enter a valid principal with at most two decimals'; end if;
  new_pi := round((v->>'principal')::numeric*100)::bigint;
  if new_pi<=0 or (prod.max_per_loan_cents is not null and new_pi>prod.max_per_loan_cents) then
    raise exception 'Corrected principal must be positive and within the product limit'; end if;
  if coalesce(v->>'monthly_rate_pct','') !~ '^[0-9]{1,3}(\.[0-9]{1,6})?$' then raise exception 'Enter a valid monthly interest rate as percent'; end if;
  new_rate := round((v->>'monthly_rate_pct')::numeric/100,8);
  if new_rate<0 or new_rate>1 then raise exception 'Monthly interest rate must be between 0 and 100 percent'; end if;
  if coalesce(v->>'term_months','') !~ '^[0-9]{1,2}$' then raise exception 'Term must be 1–36 months'; end if;
  new_term := (v->>'term_months')::integer;
  if new_term not between 1 and 36 then raise exception 'Term must be 1–36 months'; end if;
  if coalesce(v->>'release_date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v->>'first_due_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter valid release and first-installment dates'; end if;
  new_date := (v->>'release_date')::date;
  first_due := (v->>'first_due_date')::date;
  if new_date>today_ph or first_due<=new_date then raise exception 'Release date cannot be future and first due date must follow release'; end if;
  new_frequency := v->>'frequency';
  if new_frequency not in ('Monthly','Semi-monthly') then raise exception 'Choose monthly or semi-monthly installments'; end if;
  if exists(select 1 from public.payments where workspace_id=w and loan_id=lid and paid_on<new_date) then
    raise exception 'Corrected release date cannot be after a recorded receipt date'; end if;
  -- Do not rewrite a release already assigned to cash/bank/e-wallet accounts;
  -- mapped signed cash and closed statements would otherwise be inconsistent.
  if (new_pi<>old_l.principal_cents or new_date<>old_l.release_date) and exists (
    select 1 from public.cash_allocations where workspace_id=w and source_kind='loan' and source_id=lid) then
    raise exception 'Release is mapped to a cash/bank/e-wallet account. Reconcile or unassign the mapping before changing principal or release date'; end if;

  new_it := round(new_pi*new_rate*new_term)::bigint;
  new_total := new_pi + new_it;
  select coalesce(sum(amount_cents),0) into total_paid from public.payments
    where workspace_id=w and loan_id=lid;
  if total_paid<0 or total_paid>new_total then raise exception 'Existing net receipts exceed the corrected contract. Reverse or correct receipts first'; end if;
  -- Replay every receipt event in chronological order, including existing
  -- reversals. This prevents any earlier as-of snapshot exceeding the newly
  -- corrected principal/interest ceilings. Reversal components remain the
  -- exact negative of the associated (possibly corrected) original receipt.
  for r in select p.* from public.payments p
    where p.workspace_id=w and p.loan_id=lid
    order by p.paid_on,p.created_at,p.id loop
    if r.amount_cents>0 then
      count_active := count_active+1;
      pi_part := least(r.principal_cents,new_pi-used_pi);
      it_part := least(r.interest_cents,new_it-used_it);
      remainder := r.amount_cents-pi_part-it_part;
      if remainder>0 then
        pi_part := pi_part+least(remainder,new_pi-used_pi-pi_part);
        remainder := r.amount_cents-pi_part-it_part;
        it_part := it_part+least(remainder,new_it-used_it-it_part);
        remainder := r.amount_cents-pi_part-it_part;
      end if;
      if remainder<>0 then
        raise exception 'Receipt % exceeds the corrected contract as of its transaction date. Review and reverse incorrect receipts first',r.id;
      end if;
      used_pi := used_pi+pi_part;
      used_it := used_it+it_part;
      planned_map := planned_map||jsonb_build_object(r.id,jsonb_build_object('principal',pi_part,'interest',it_part));
    else
      if r.reverses_id is null or not (planned_map ? r.reverses_id) then
        raise exception 'Cannot replay unmatched reversal %',r.id;
      end if;
      prior_split := planned_map->r.reverses_id;
      pi_part := -(prior_split->>'principal')::bigint;
      it_part := -(prior_split->>'interest')::bigint;
      if pi_part+it_part<>r.amount_cents then
        raise exception 'Original receipt and reversal amount do not match for %',r.id;
      end if;
      used_pi := used_pi+pi_part;
      used_it := used_it+it_part;
      if used_pi<0 or used_it<0 then raise exception 'Invalid reversed receipt balances: %',r.id; end if;
    end if;
    if pi_part<>r.principal_cents or it_part<>r.interest_cents then
      reallocations := reallocations||jsonb_build_array(jsonb_build_object(
        'receipt_id',r.id,'old_principal_cents',r.principal_cents,'old_interest_cents',r.interest_cents,
        'new_principal_cents',pi_part,'new_interest_cents',it_part,'amount_cents',r.amount_cents));
    end if;
  end loop;
  -- 'receipt_count' reports net active receipts, excluding reversed pairs.
  select count(*) into count_active from public.payments p where p.workspace_id=w
    and p.loan_id=lid and p.amount_cents>0 and not exists(
      select 1 from public.payments rev where rev.workspace_id=w and rev.reverses_id=p.id);
  n := new_term * (case when new_frequency='Monthly' then 1 else 2 end);
  for j in 0..n-1 loop
    due := case when new_frequency='Monthly' then (first_due + make_interval(months=>j))::date else first_due + j*15 end;
    fresh_schedule := fresh_schedule||jsonb_build_array(jsonb_build_object(
      'installment_no',j+1,'due_date',due,'amount_cents',
      (new_total/n)::bigint + case when j < (new_total%n) then 1 else 0 end));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('installment_no',i.installment_no,'due_date',i.due_date,'amount_cents',i.amount_cents)
     order by i.installment_no),'[]'::jsonb) into old_schedule
  from public.installments i where workspace_id=w and loan_id=lid;
  old_agreement := jsonb_build_object('borrower_id',old_l.borrower_id,'product_id',old_l.product_id,
    'release_date',old_l.release_date,'principal_cents',old_l.principal_cents,
    'monthly_rate',old_l.monthly_rate,'term_months',old_l.term_months,
    'interest_cents',old_l.interest_cents,'payable_cents',old_l.payable_cents,
    'source',old_l.source);
  new_agreement := jsonb_build_object('borrower_id',new_borrower,'product_id',new_product,
    'release_date',new_date,'principal_cents',new_pi,'monthly_rate',new_rate,
    'term_months',new_term,'interest_cents',new_it,'payable_cents',new_total,
    'source',old_l.source);
  if old_agreement=new_agreement and old_schedule=fresh_schedule and jsonb_array_length(reallocations)=0 then
    raise exception 'No loan details were changed'; end if;
  checksum := md5(jsonb_build_object('loan',to_jsonb(old_l),
    'installments',coalesce((select jsonb_agg(to_jsonb(i) order by i.installment_no) from public.installments i
                               where i.workspace_id=w and i.loan_id=lid),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on,p.created_at,p.id) from public.payments p
                           where p.workspace_id=w and p.loan_id=lid),'[]'::jsonb))::text);
  return jsonb_build_object('loan_id',lid,'old_loan',old_agreement,'new_loan',new_agreement,
    'old_schedule',old_schedule,'new_schedule',fresh_schedule,'receipt_reallocations',reallocations,
    'receipt_count',count_active,'net_receipts_cents',total_paid,
    'old_balance_cents',old_l.payable_cents-total_paid,'new_balance_cents',new_total-total_paid,
    'cash_change_cents',old_l.principal_cents-new_pi,'revision',checksum,
    'restatement_notice','Correcting terms restates all historical as-of financial projections; previous values remain in the audit journal.');
end $$;

create or replace function public.cove_correct_loan(w uuid, lid text, v jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  plan jsonb; line jsonb; item jsonb; change_id uuid; reason text;
  old_agreement jsonb; new_agreement jsonb; corrected_pi bigint;
begin
  perform public.cove_assert_owner(w);
  perform pg_advisory_xact_lock(hashtext(w::text));
  if v->>'confirm_loan_id' is distinct from lid or v->>'acknowledge_restatement' is distinct from 'true' then
    raise exception 'Explicit loan ID confirmation and financial restatement acknowledgment required'; end if;
  plan := public.cove_plan_loan_correction(w,lid,v);
  if v->>'expected_revision' is distinct from plan->>'revision' then
    raise exception 'The loan or receipts changed since preview. Refresh and preview again'; end if;
  new_agreement := plan->'new_loan';old_agreement := plan->'old_loan';
  corrected_pi := (new_agreement->>'principal_cents')::bigint;
  if corrected_pi>(old_agreement->>'principal_cents')::bigint then
    if corrected_pi-(old_agreement->>'principal_cents')::bigint > public.cove_cash(w,(now() at time zone 'Asia/Manila')::date) then
      raise exception 'Corrected additional principal exceeds current fund cash; verify funding before correcting'; end if;
  end if;
  update public.loans set
    borrower_id=new_agreement->>'borrower_id', product_id=new_agreement->>'product_id',
    release_date=(new_agreement->>'release_date')::date,
    principal_cents=corrected_pi, monthly_rate=(new_agreement->>'monthly_rate')::numeric,
    term_months=(new_agreement->>'term_months')::integer,
    interest_cents=(new_agreement->>'interest_cents')::bigint,
    payable_cents=(new_agreement->>'payable_cents')::bigint
   where workspace_id=w and id=lid;
  -- Original schedules are saved in the correction record before replacement.
  delete from public.installments where workspace_id=w and loan_id=lid;
  for line in select value from jsonb_array_elements(plan->'new_schedule') loop
    insert into public.installments(workspace_id,loan_id,installment_no,due_date,amount_cents)
      values(w,lid,(line->>'installment_no')::integer,(line->>'due_date')::date,(line->>'amount_cents')::bigint);
  end loop;
  for item in select value from jsonb_array_elements(plan->'receipt_reallocations') loop
    update public.payments set principal_cents=(item->>'new_principal_cents')::bigint,
      interest_cents=(item->>'new_interest_cents')::bigint
      where workspace_id=w and loan_id=lid and id=item->>'receipt_id';
  end loop;
  reason := trim(v->>'reason');
  insert into public.loan_corrections(workspace_id,loan_id,actor_id,reason,old_loan,new_loan,old_schedule,new_schedule,
    receipt_reallocations,expected_revision)
   values(w,lid,auth.uid(),reason,plan->'old_loan',plan->'new_loan',plan->'old_schedule',plan->'new_schedule',
      plan->'receipt_reallocations',plan->>'revision') returning id into change_id;
  insert into public.audit_log(workspace_id,actor_id,action,entity,entity_id,details)
   values(w,auth.uid(),'CORRECT','loan',lid,jsonb_build_object('correction_id',change_id,'reason',reason,
     'old',plan->'old_loan','new',plan->'new_loan','reallocated_receipts',plan->'receipt_reallocations',
     'old_schedule',plan->'old_schedule','new_schedule',plan->'new_schedule'));
  return jsonb_build_object('ok',true,'id',change_id,'loan_id',lid,
    'reallocated_receipts',jsonb_array_length(plan->'receipt_reallocations'),
    'cash_change_cents',plan->'cash_change_cents','new_balance_cents',plan->'new_balance_cents');
end $$;

revoke all on function public.cove_plan_loan_correction(uuid,text,jsonb) from public,anon;
revoke all on function public.cove_correct_loan(uuid,text,jsonb) from public,anon;
grant execute on function public.cove_plan_loan_correction(uuid,text,jsonb) to authenticated;
grant execute on function public.cove_correct_loan(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
